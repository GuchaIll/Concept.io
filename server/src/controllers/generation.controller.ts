/**
 * Generation Controller - Handles AI image generation API endpoints
 */

import { Router, Request, Response } from 'express';
import Controller from './controller';

// Diffusion service URL
const DIFFUSION_SERVICE_URL = process.env.DIFFUSION_SERVICE_URL || 'http://127.0.0.1:8000';

interface GenerationJob {
  id: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  model?: string;
  status: 'pending' | 'loading_model' | 'generating' | 'completed' | 'failed';
  progress: number;
  imageData?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
  userId: string;
  projectId: string;
  diffusionJobId?: string; // ID from Python service
}

// In-memory job storage (for demo without Redis)
const jobs = new Map<string, GenerationJob>();

// Generate unique ID
const generateId = () => `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export class GenerationController extends Controller {
  constructor() {
    super('/api/generate');
  }

  public initializeRoutes(): void {
    // POST /api/generate - Submit new generation request
    this.router.post('/', this.submitGeneration.bind(this));

    // GET /api/generate/status/:jobId - Get job status
    this.router.get('/status/:jobId', this.getJobStatus.bind(this));

    // GET /api/generate/jobs/:userId - Get all jobs for user
    this.router.get('/jobs/:userId', this.getUserJobs.bind(this));

    // DELETE /api/generate/:jobId - Cancel job
    this.router.delete('/:jobId', this.cancelJob.bind(this));

    // GET /api/generate/queue/stats - Get queue statistics
    this.router.get('/queue/stats', this.getQueueStats.bind(this));
  }

  private async submitGeneration(req: Request, res: Response): Promise<void> {
    try {
      const {
        prompt,
        negativePrompt,
        width = 512,
        height = 512,
        steps = 25,  // Increased default for better quality
        guidanceScale = 7.5,
        model = 'sd15',
        seed,
        userId,
        projectId,
        selectionBounds,
        assetType,
      } = req.body;

      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
      }

      if (!userId || !projectId) {
        res.status(400).json({ error: 'userId and projectId are required' });
        return;
      }

      // Create job
      const jobId = generateId();
      const normalizedWidth = Math.round(width / 8) * 8;
      const normalizedHeight = Math.round(height / 8) * 8;
      
      const job: GenerationJob = {
        id: jobId,
        prompt,
        negativePrompt: negativePrompt || undefined,
        width: normalizedWidth,
        height: normalizedHeight,
        model,
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString(),
        userId,
        projectId,
      };

      jobs.set(jobId, job);

      // Estimate time based on model and size
      // SDXL takes significantly longer than SD 1.5
      const isSDXL = model === 'sdxl';
      const baseTime = isSDXL ? 20 : 8; // Base time in seconds
      const sizeMultiplier = (normalizedWidth * normalizedHeight) / (512 * 512);
      const stepMultiplier = steps / 25;
      const estimatedTime = Math.round(baseTime * Math.sqrt(sizeMultiplier) * stepMultiplier);

      console.log(`Generation job ${jobId} created:`, {
        prompt: prompt.substring(0, 50),
        size: `${job.width}x${job.height}`,
        model,
        steps,
        guidanceScale,
        estimatedTime: `${estimatedTime}s`,
      });

      // Start actual generation via Python diffusion service
      this.startRealGeneration(jobId, {
        prompt,
        negativePrompt: job.negativePrompt,
        width: normalizedWidth,
        height: normalizedHeight,
        steps,
        guidanceScale,
        model,
        seed,
        assetType,
      });

      res.status(202).json({
        success: true,
        jobId,
        estimatedTime,
        queuePosition: 1,
      });
    } catch (error) {
      console.error('Submit generation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Start real generation by calling Python diffusion service
   */
  private async startRealGeneration(jobId: string, params: {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    steps: number;
    guidanceScale: number;
    model: string;
    seed?: number;
    assetType?: string;
  }): Promise<void> {
    const job = jobs.get(jobId);
    if (!job) return;

    try {
      // First check if diffusion service is healthy with retry
      let diffusionReady = false;
      for (let retry = 0; retry < 3; retry++) {
        try {
          console.log(`Checking diffusion service health (attempt ${retry + 1}/3)...`);
          const healthResponse = await fetch(`${DIFFUSION_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(15000) // 15 second timeout — cold start loads PyTorch
          });
          
          if (!healthResponse.ok) {
            const errorText = await healthResponse.text();
            console.log(`Diffusion service health check returned ${healthResponse.status}: ${errorText}`);
            // Wait before retry
            if (retry < 2) await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          
          const health = await healthResponse.json();
          console.log(`Diffusion service health:`, health);
          
          // Accept both real and mock mode - Python service generates valid PNGs in both
          if (health.status === 'healthy') {
            console.log(`Diffusion service ready (mode: ${health.mode})`);
            diffusionReady = true;
            break;
          }
        } catch (healthError: any) {
          console.error(`Health check attempt ${retry + 1} failed:`, healthError.message || healthError);
          // Wait before retry
          if (retry < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      if (!diffusionReady) {
        console.log(`Diffusion service not available after retries, using placeholder`);
        this.simulateGeneration(jobId);
        return;
      }

      // Call Python diffusion service
      console.log(`Calling diffusion service for job ${jobId}:`, {
        url: `${DIFFUSION_SERVICE_URL}/generate`,
        prompt: params.prompt.substring(0, 50),
        width: params.width,
        height: params.height,
        model: params.model,
      });

      const response = await fetch(`${DIFFUSION_SERVICE_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: params.prompt,
          negative_prompt: params.negativePrompt,
          width: params.width,
          height: params.height,
          steps: params.steps,
          guidance_scale: params.guidanceScale,
          model: params.model,
          seed: params.seed,
          use_refiner: params.useRefiner ?? false,
          asset_type: params.assetType || null,
        }),
      });

      console.log(`Diffusion service response status:`, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Diffusion service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`Diffusion service started job:`, {
        job_id: result.job_id,
        status: result.status,
        estimated_time: result.estimated_time,
      });
      
      job.diffusionJobId = result.job_id;
      job.status = 'loading_model';
      job.progress = 5;

      console.log(`Diffusion job ${result.job_id} started for ${jobId}`);

      // Poll for completion
      this.pollDiffusionStatus(jobId, result.job_id);

    } catch (error) {
      console.error(`Failed to start diffusion for ${jobId}:`, error);
      
      // Fallback to placeholder if diffusion service is unavailable
      console.log(`Falling back to placeholder for ${jobId}`);
      this.simulateGeneration(jobId);
    }
  }

  /**
   * Poll Python diffusion service for job status
   */
  private async pollDiffusionStatus(jobId: string, diffusionJobId: string): Promise<void> {
    const POLL_INTERVAL = 500; // 500ms between polls

    // SDXL is heavier — allow more time (10 min vs 5 min for SD 1.5)
    const job0 = jobs.get(jobId);
    const isSDXL = job0?.model === 'sdxl';
    const MAX_POLLS = isSDXL ? 1200 : 600; // 10 min SDXL, 5 min SD1.5
    
    let polls = 0;
    
    while (polls < MAX_POLLS) {
      const job = jobs.get(jobId);
      if (!job) {
        console.log(`Job ${jobId} was cancelled, stopping poll`);
        return;
      }

      try {
        const response = await fetch(`${DIFFUSION_SERVICE_URL}/job/${diffusionJobId}`);
        
        if (!response.ok) {
          throw new Error(`Poll error: ${response.status}`);
        }

        const status = await response.json();

        // Log the poll response for debugging
        if (polls % 5 === 0 || status.status === 'completed') {
          console.log(`Poll #${polls} for ${jobId}:`, {
            status: status.status,
            progress: status.progress,
            hasImageData: !!status.image_data,
            imageDataLength: status.image_data?.length,
            imageDataPrefix: status.image_data?.substring(0, 50),
          });
        }

        // Update job status
        switch (status.status) {
          case 'loading_model':
            job.status = 'loading_model';
            job.progress = Math.max(job.progress, 10);
            break;
          case 'generating':
            job.status = 'generating';
            job.progress = Math.max(status.progress || 20, job.progress);
            break;
          case 'completed':
            job.status = 'completed';
            job.progress = 100;
            job.imageData = status.image_data;
            job.completedAt = new Date().toISOString();
            console.log(`Generation job ${jobId} completed with image from Python service:`, {
              hasImageData: !!status.image_data,
              imageDataLength: status.image_data?.length,
              imageDataType: status.image_data?.substring(0, 30),
            });
            return;
          case 'failed':
            job.status = 'failed';
            job.error = status.error || 'Generation failed';
            console.log(`Generation job ${jobId} failed: ${job.error}`);
            return;
        }

      } catch (error) {
        console.error(`Poll error for ${jobId}:`, error);
        // Continue polling, don't fail immediately
      }

      await this.delay(POLL_INTERVAL);
      polls++;
    }

    // Timeout - mark as failed
    const job = jobs.get(jobId);
    if (job && job.status !== 'completed') {
      job.status = 'failed';
      job.error = 'Generation timed out';
      console.log(`Generation job ${jobId} timed out`);
    }
  }

  private getJobStatus(req: Request, res: Response): void {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      imageData: job.imageData,
      error: job.error,
      completedAt: job.completedAt,
    });
  }

  private getUserJobs(req: Request, res: Response): void {
    const { userId } = req.params;
    
    const userJobs = Array.from(jobs.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ jobs: userJobs });
  }

  private async cancelJob(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.status === 'completed' || job.status === 'failed') {
      res.status(400).json({ error: 'Job already finished' });
      return;
    }

    jobs.delete(jobId);
    res.json({ success: true, message: 'Job cancelled' });
  }

  private getQueueStats(_req: Request, res: Response): void {
    const allJobs = Array.from(jobs.values());
    
    const stats = {
      waiting: allJobs.filter(j => j.status === 'pending').length,
      active: allJobs.filter(j => j.status === 'loading_model' || j.status === 'generating').length,
      completed: allJobs.filter(j => j.status === 'completed').length,
      failed: allJobs.filter(j => j.status === 'failed').length,
    };

    res.json(stats);
  }

  /**
   * Simulate generation progress (fallback when diffusion service is unavailable)
   */
  private async simulateGeneration(jobId: string): Promise<void> {
    const job = jobs.get(jobId);
    if (!job) return;

    // Simulate loading model
    job.status = 'loading_model';
    job.progress = 10;
    
    await this.delay(500);

    // Simulate generating
    job.status = 'generating';
    
    for (let i = 20; i <= 90; i += 10) {
      await this.delay(300);
      const currentJob = jobs.get(jobId);
      if (!currentJob) return; // Job was cancelled
      currentJob.progress = i;
    }

    // Complete with placeholder image
    const finalJob = jobs.get(jobId);
    if (!finalJob) return;
    
    finalJob.status = 'completed';
    finalJob.progress = 100;
    finalJob.completedAt = new Date().toISOString();
    
    // Generate a simple placeholder image (colored rectangle with text)
    finalJob.imageData = this.generatePlaceholderImage(finalJob.prompt, finalJob.width, finalJob.height);
    
    console.log(`Generation job ${jobId} completed`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a simple placeholder image for demo purposes
   * In production, this would be replaced with actual diffusion model output
   */
  private generatePlaceholderImage(prompt: string, width: number, height: number): string {
    // Create a simple SVG placeholder
    const hue = Math.floor(Math.random() * 360);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:hsl(${hue}, 60%, 50%)"/>
            <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360}, 60%, 30%)"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" 
              fill="white" font-family="Arial" font-size="14" opacity="0.9">
          AI Generated
        </text>
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" 
              fill="white" font-family="Arial" font-size="10" opacity="0.7">
          ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}
        </text>
      </svg>
    `;
    
    // Convert SVG to base64 data URL
    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }
}

export default GenerationController;
