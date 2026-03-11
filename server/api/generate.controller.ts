/**
 * Generation Controller - API endpoints for AI image generation
 */

import { Router, Request, Response } from 'express';
import {
  submitGeneration,
  getGenerationStatus,
  getProjectJobs,
  cancelGeneration,
  getGenerationQueueStats,
  GenerateRequest,
} from '../services/diffusion.service';

const router = Router();

/**
 * POST /api/generate
 * Submit a new generation request
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      guidanceScale,
      model,
      seed,
      userId,
      projectId,
      selectionBounds,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!userId || !projectId) {
      return res.status(400).json({ error: 'userId and projectId are required' });
    }

    const request: GenerateRequest = {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      guidanceScale,
      model,
      seed,
      userId,
      projectId,
      selectionBounds,
    };

    const result = await submitGeneration(request);

    if (result.success) {
      res.status(202).json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/generate/status/:jobId
 * Get status of a specific generation job
 */
router.get('/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  const status = getGenerationStatus(jobId);
  
  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(status);
});

/**
 * GET /api/generate/jobs/:userId
 * Get all jobs for a user
 */
router.get('/jobs/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  
  const jobs = getProjectJobs(userId);
  res.json({ jobs });
});

/**
 * DELETE /api/generate/:jobId
 * Cancel a pending generation job
 */
router.delete('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  const cancelled = await cancelGeneration(jobId);
  
  if (cancelled) {
    res.json({ success: true, message: 'Job cancelled' });
  } else {
    res.status(404).json({ error: 'Job not found or already completed' });
  }
});

/**
 * GET /api/generate/queue/stats
 * Get queue statistics
 */
router.get('/queue/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getGenerationQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

export default router;
