/**
 * Edit Controller
 * Proxies image-editing requests to the Python diffusion service /edit endpoint.
 *
 * Routes:
 *   POST /api/edit              — submit an edit job (returns jobId immediately)
 *   GET  /api/edit/status/:id   — poll for progress / result
 */

import { Request, Response } from 'express';
import Controller from './controller';

// undici is bundled with Node 22 — we use its Agent to override the default
// 5-minute headersTimeout that kills long-running diffusion requests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Agent: UndiciAgent } = require('undici');

// ── Request / response shapes (camelCase — used by Node ↔ client) ─────────

export type EditMode  = 'instruction' | 'inpaint' | 'controlnet' | 'outpaint';
export type EditModel = 'edit' | 'flux';

export interface EditRequest {
  imageData: string;                    // base64 source image
  prompt: string;
  negativePrompt?: string;
  mode?: EditMode;                      // default: 'instruction'
  maskData?: string;                    // base64 mask — required for inpaint mode
  referenceImageData?: string;          // base64 IP-Adapter style reference
  strength?: number;                    // img2img denoising strength (0–1)
  steps?: number;
  guidanceScale?: number;
  controlnetType?: number;              // 0=pose 1=depth 2=soft-edge 3=canny …
  controlnetScale?: number;
  ipAdapterScale?: number;
  width?: number;
  height?: number;
  seed?: number;
  model?: EditModel;                    // default: 'edit'
  padding?: { top: number; bottom: number; left: number; right: number };
}

export interface EditResponse {
  success: boolean;
  imageData?: string;                   // base64 PNG result
  processingTime: number;
  error?: string;
}

// Python service returns snake_case ────────────────────────────────────────

interface PythonEditResponse {
  success: boolean;
  image_data?: string;
  processing_time: number;
  error?: string;
}

// ── In-memory job store ────────────────────────────────────────────────────

interface EditJob {
  id: string;
  prompt: string;
  status: 'pending' | 'loading_model' | 'generating' | 'completed' | 'failed';
  progress: number;
  imageData?: string;
  processingTime?: number;
  error?: string;
  createdAt: number;
}

const editJobs = new Map<string, EditJob>();

// Clean up completed/failed jobs after 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of editJobs) {
    if ((job.status === 'completed' || job.status === 'failed') && now - job.createdAt > 10 * 60_000) {
      editJobs.delete(id);
    }
  }
}, 60_000);

// ── Controller ─────────────────────────────────────────────────────────────

export class EditController extends Controller {
  private diffusionServiceUrl: string;

  constructor() {
    super('/api/edit');
    this.diffusionServiceUrl = process.env.DIFFUSION_SERVICE_URL || 'http://127.0.0.1:8000';
  }

  public initializeRoutes(): void {
    this.router.post('/', this.submitEdit.bind(this));
    this.router.get('/status/:jobId', this.getJobStatus.bind(this));
  }

  // ── GET /api/edit/status/:jobId ───────────────────────────────────────────

  private getJobStatus(req: Request, res: Response): void {
    const { jobId } = req.params;
    const job = editJobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Prevent 304 — every poll must return fresh data so the client sees updates
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('ETag', `"${job.id}-${job.progress}-${Date.now()}"`);

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      imageData: job.imageData,
      processingTime: job.processingTime,
      error: job.error,
    });
  }

  // ── POST /api/edit ────────────────────────────────────────────────────────

  private async submitEdit(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as EditRequest;

      if (!body.imageData) {
        res.status(400).json({ success: false, error: 'imageData is required', processingTime: 0 });
        return;
      }
      if (!body.prompt) {
        res.status(400).json({ success: false, error: 'prompt is required', processingTime: 0 });
        return;
      }
      if (body.mode === 'inpaint' && !body.maskData) {
        res.status(400).json({ success: false, error: 'maskData is required for inpaint mode', processingTime: 0 });
        return;
      }

      // Create a job and return immediately
      const jobId = `edit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const job: EditJob = {
        id: jobId,
        prompt: body.prompt,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
      };
      editJobs.set(jobId, job);

      console.log(`[edit][${new Date().toISOString()}] ── JOB CREATED ──  id=${jobId}`);
      console.log('[edit]  mode=%s  model=%s  prompt="%s"', body.mode ?? 'instruction', body.model ?? 'edit', body.prompt.slice(0, 80));
      console.log('[edit]  hasMask=%s  hasRef=%s  size=%dx%d  strength=%s  steps=%s',
        !!body.maskData, !!body.referenceImageData,
        body.width ?? 1024, body.height ?? 1024,
        body.strength ?? 0.75, body.steps ?? 20);

      // Return jobId immediately — client will poll /status/:jobId
      res.status(202).json({ success: true, jobId });

      // Fire off the actual edit in the background
      this.runEditInBackground(jobId, body);
    } catch (error) {
      console.error('[edit] Controller error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0,
      });
    }
  }

  // ── Background runner ─────────────────────────────────────────────────────

  private async runEditInBackground(jobId: string, body: EditRequest): Promise<void> {
    const job = editJobs.get(jobId);
    if (!job) return;

    const t0 = Date.now();

    try {
      // Stage 1: preparing payload → 10%
      job.status = 'loading_model';
      job.progress = 10;

      // camelCase → snake_case for the Python service
      const pythonBody: Record<string, unknown> = {
        image_data:            body.imageData,
        prompt:                body.prompt,
        negative_prompt:       body.negativePrompt ?? 'blurry, bad quality, distorted, artifacts, watermark',
        mode:                  body.mode           ?? 'instruction',
        strength:              body.strength       ?? 0.75,
        steps:                 body.steps          ?? 20,
        guidance_scale:        body.guidanceScale  ?? 7.5,
        controlnet_type:       body.controlnetType ?? 1,
        controlnet_scale:      body.controlnetScale ?? 0.8,
        ip_adapter_scale:      body.ipAdapterScale ?? 0.6,
        width:                 body.width          ?? 1024,
        height:                body.height         ?? 1024,
        model:                 body.model          ?? 'edit',
      };

      if (body.maskData)           pythonBody.mask_data            = body.maskData;
      if (body.referenceImageData) pythonBody.reference_image_data = body.referenceImageData;
      if (body.seed != null)       pythonBody.seed                 = body.seed;
      if (body.padding) {
        pythonBody.padding_top    = body.padding.top    ?? 0;
        pythonBody.padding_bottom = body.padding.bottom ?? 0;
        pythonBody.padding_left   = body.padding.left   ?? 0;
        pythonBody.padding_right  = body.padding.right  ?? 0;
      }

      const jsonPayload = JSON.stringify(pythonBody);
      console.log('[edit]  payload size=%s MB — forwarding to Python %s/edit …',
        (jsonPayload.length / 1024 / 1024).toFixed(2), this.diffusionServiceUrl);

      // Stage 2: generating → 20–90%  (simulate progress while Python runs)
      job.status = 'generating';
      job.progress = 20;

      // Start a synthetic progress ticker that runs until Python responds.
      // Uses an asymptotic curve so progress never truly "sticks":
      //   - First phase (0 → estMs):  20 → 85  (linear-ish)
      //   - Second phase (> estMs):   85 → 99  (slowly approaches 99, never reaches it)
      const steps  = body.steps ?? 20;
      const estMs  = steps * 3000;            // rough estimate: 3s per step w/ CPU offload
      const tickMs = 1000;                    // update every 1s
      const progressTimer = setInterval(() => {
        const j = editJobs.get(jobId);
        if (!j || j.status === 'completed' || j.status === 'failed') {
          clearInterval(progressTimer);
          return;
        }
        const elapsed = Date.now() - t0;
        let pct: number;
        if (elapsed <= estMs) {
          // Phase 1: linear 20 → 85
          pct = 20 + Math.round(65 * (elapsed / estMs));
        } else {
          // Phase 2: asymptotic 85 → 99
          const overtime = elapsed - estMs;
          pct = 85 + Math.round(14 * (1 - Math.exp(-overtime / 30_000)));
        }
        j.progress = Math.max(j.progress, Math.min(99, pct));
      }, tickMs);

      // Node's built-in fetch uses undici which has a default headersTimeout
      // of 300s.  Cold pipeline loads can easily exceed that, so we create a
      // one-off Agent with generous timeouts for this long-running request.
      const longPollAgent = new UndiciAgent({
        headersTimeout:  600_000,   // 10 min — wait for Python to finish loading models
        bodyTimeout:     600_000,   // 10 min — wait for the (large base64) response body
        connectTimeout:  30_000,    // 30s to establish the TCP connection
      });

      const response = await fetch(`${this.diffusionServiceUrl}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPayload,
        signal: AbortSignal.timeout(600_000),       // 10 min overall abort
        dispatcher: longPollAgent,                  // override undici's default 5-min headers timeout
      } as RequestInit);

      clearInterval(progressTimer);

      console.log('[edit]  Python responded  status=%d  after %ds',
        response.status, ((Date.now() - t0) / 1000).toFixed(1));

      if (!response.ok) {
        const text = await response.text();
        console.error('[edit] Service error:', response.status, text);
        job.status = 'failed';
        job.error  = `Diffusion service error: ${response.status}`;
        return;
      }

      const python = await response.json() as PythonEditResponse;

      if (python.success && python.image_data) {
        job.status         = 'completed';
        job.progress       = 100;
        job.imageData      = python.image_data;
        job.processingTime = python.processing_time;
        console.log('[edit] ── DONE ──  success=true  pyTime=%ss  totalTime=%ds  resultSize=%s KB',
          python.processing_time,
          ((Date.now() - t0) / 1000).toFixed(1),
          (python.image_data.length / 1024).toFixed(0));
      } else {
        job.status = 'failed';
        job.error  = python.error ?? 'Edit failed';
        console.log('[edit] ── DONE ──  success=false  error=%s', job.error);
      }
    } catch (error) {
      console.error('[edit] Background runner error:', error);
      const j = editJobs.get(jobId);
      if (j) {
        j.status = 'failed';
        // Provide a friendlier message for timeout errors
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          j.error = 'Edit timed out — the model may be loading for the first time. Please try again.';
        } else {
          j.error = error instanceof Error ? error.message : 'Unknown error';
        }
      }
    }
  }
}
