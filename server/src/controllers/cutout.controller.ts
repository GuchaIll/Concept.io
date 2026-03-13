/**
 * Cutout Controller
 * Handles background removal for foreground assets via the Python diffusion service.
 *
 * Routes:
 *   POST /api/cutout/proposals â€” SAM proposal engine (returns coloured overlays)
 *   POST /api/cutout/apply     â€” apply user-selected mask(s) â†’ RGBA cutout
 *   POST /api/cutout           â€” legacy one-shot auto-cutout
 *   GET  /api/cutout/health    â€” service status
 */

import { Request, Response } from 'express';
import Controller from './controller';

// â”€â”€ Request / response shapes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CutoutRequest {
  imageData: string;
  featherRadius?: number;
  threshold?: number;
  refineMask?: boolean;
}

interface CutoutResponse {
  success: boolean;
  imageData?: string;
  originalSize?: [number, number];
  processingTime?: number;
  cropBox?: [number, number, number, number]; // [left, top, width, height] in px
  error?: string;
}

interface MaskProposalsRequest {
  imageData: string;
  maxProposals?: number;
}

interface MaskProposal {
  id: number;
  overlay: string;
  mask: string;
  areaRatio: number;
  stabilityScore: number;
  compositeScore: number;
  backgroundScore: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
  color: [number, number, number];
}

interface MaskProposalsResponse {
  success: boolean;
  proposals: MaskProposal[];
  imageSize?: [number, number];
  processingTime?: number;
  engine?: string;
  error?: string;
}

interface CutoutFromMaskRequest {
  imageData: string;
  maskData: string[];         // one or more base64 grayscale mask PNGs
  featherRadius?: number;
  threshold?: number;
  refineMask?: boolean;
}

// Python API uses snake_case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PythonCutoutResponse {
  success: boolean;
  image_data?: string;
  original_size?: [number, number];
  processing_time?: number;
  crop_box?: [number, number, number, number];
  error?: string;
}

interface PythonMaskProposal {
  id: number;
  overlay: string;
  mask: string;
  area_ratio: number;
  stability_score: number;
  composite_score: number;
  background_score: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
  color: [number, number, number];
}

interface PythonMaskProposalsResponse {
  success: boolean;
  proposals: PythonMaskProposal[];
  image_size?: [number, number];
  processing_time?: number;
  engine?: string;
  error?: string;
}

// â”€â”€ Controller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class CutoutController extends Controller {
  private diffusionServiceUrl: string;

  constructor() {
    super('/api/cutout');
    this.diffusionServiceUrl = process.env.DIFFUSION_SERVICE_URL || 'http://127.0.0.1:8000';
  }

  public initializeRoutes(): void {
    this.router.post('/proposals', this.getMaskProposals.bind(this));
    this.router.post('/apply', this.applySelectedMasks.bind(this));
    this.router.post('/', this.processCutout.bind(this));
    this.router.get('/health', this.checkHealth.bind(this));
  }

  // â”€â”€ POST /api/cutout/proposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async getMaskProposals(req: Request, res: Response): Promise<void> {
    try {
      const { imageData, maxProposals = 12 } = req.body as MaskProposalsRequest;

      if (!imageData) {
        res.status(400).json({ success: false, error: 'imageData is required' });
        return;
      }

      console.log('[cutout/proposals] Requesting mask proposals:', {
        imageDataLength: imageData.length,
        maxProposals,
      });

      const response = await fetch(`${this.diffusionServiceUrl}/cutout/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: imageData,
          max_proposals: maxProposals,
        }),
      });

      if (!response.ok) {
        console.error('[cutout/proposals] Service error:', response.status);
        res.status(response.status).json({ success: false, error: `Service error: ${response.status}` });
        return;
      }

      const python = await response.json() as PythonMaskProposalsResponse;

      console.log('[cutout/proposals] Got proposals:', {
        success: python.success,
        count: python.proposals?.length ?? 0,
        engine: python.engine,
        processingTime: python.processing_time,
      });

      // snake_case â†’ camelCase
      const result: MaskProposalsResponse = {
        success: python.success,
        proposals: (python.proposals ?? []).map((p): MaskProposal => ({
          id: p.id,
          overlay: p.overlay,
          mask: p.mask,
          areaRatio: p.area_ratio,
          stabilityScore: p.stability_score,
          compositeScore: p.composite_score,
          backgroundScore: p.background_score,
          bbox: p.bbox,
          centroid: p.centroid,
          color: p.color,
        })),
        imageSize: python.image_size,
        processingTime: python.processing_time,
        engine: python.engine,
        error: python.error,
      };

      res.json(result);
    } catch (error) {
      console.error('[cutout/proposals] Controller error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // â”€â”€ POST /api/cutout/apply â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async applySelectedMasks(req: Request, res: Response): Promise<void> {
    try {
      const {
        imageData,
        maskData,
        featherRadius = 0,
        threshold = 128,
        refineMask = true,
      } = req.body as CutoutFromMaskRequest;

      if (!imageData || !maskData?.length) {
        res.status(400).json({ success: false, error: 'imageData and maskData[] are required' });
        return;
      }

      console.log('[cutout/apply] Applying masks:', {
        imageDataLength: imageData.length,
        maskCount: maskData.length,
        featherRadius,
        threshold,
        refineMask,
      });

      const response = await fetch(`${this.diffusionServiceUrl}/cutout/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: imageData,
          mask_data: maskData,
          feather_radius: featherRadius,
          threshold,
          refine_mask: refineMask,
        }),
      });

      if (!response.ok) {
        console.error('[cutout/apply] Service error:', response.status);
        res.status(response.status).json({ success: false, error: `Service error: ${response.status}` });
        return;
      }

      const python = await response.json() as PythonCutoutResponse;

      const result: CutoutResponse = {
        success: python.success,
        imageData: python.image_data,
        originalSize: python.original_size,
        processingTime: python.processing_time,
        cropBox: python.crop_box,
        error: python.error,
      };

      console.log('[cutout/apply] Done:', {
        success: result.success,
        processingTime: result.processingTime,
      });

      res.json(result);
    } catch (error) {
      console.error('[cutout/apply] Controller error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // â”€â”€ POST /api/cutout â€” legacy one-shot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async processCutout(req: Request, res: Response): Promise<void> {
    try {
      const {
        imageData,
        featherRadius = 0,
        threshold = 128,
        refineMask = true,
      } = req.body as CutoutRequest;

      if (!imageData) {
        res.status(400).json({ success: false, error: 'imageData is required' });
        return;
      }

      console.log('[cutout] Processing cutout request:', {
        imageDataLength: imageData?.length,
        featherRadius,
        threshold,
        refineMask,
      });

      const response = await fetch(`${this.diffusionServiceUrl}/cutout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: imageData,
          feather_radius: featherRadius,
          threshold,
          refine_mask: refineMask,
          output_format: 'png',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[cutout] Service error:', errorText);
        res.status(response.status).json({ success: false, error: `Cutout service error: ${response.status}` });
        return;
      }

      const python = await response.json() as PythonCutoutResponse;

      const result: CutoutResponse = {
        success: python.success,
        imageData: python.image_data,
        originalSize: python.original_size,
        processingTime: python.processing_time,
        error: python.error,
      };

      if (result.success) {
        console.log('[cutout] Completed:', {
          processingTime: result.processingTime,
          imageDataLength: result.imageData?.length,
        });
      } else {
        console.error('[cutout] Failed:', result.error);
      }

      res.json(result);
    } catch (error) {
      console.error('[cutout] Controller error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // â”€â”€ GET /api/cutout/health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async checkHealth(req: Request, res: Response): Promise<void> {
    try {
      const response = await fetch(`${this.diffusionServiceUrl}/cutout/health`);
      if (!response.ok) {
        res.json({ available: false, error: `Service returned ${response.status}` });
        return;
      }
      const health = await response.json();
      res.json({ available: true, ...health });
    } catch (error) {
      res.json({
        available: false,
        error: error instanceof Error ? error.message : 'Service unavailable',
      });
    }
  }
}
