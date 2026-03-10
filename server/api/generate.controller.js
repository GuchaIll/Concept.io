"use strict";
/**
 * Generation Controller - API endpoints for AI image generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const diffusion_service_1 = require("../services/diffusion.service");
const router = (0, express_1.Router)();
/**
 * POST /api/generate
 * Submit a new generation request
 */
router.post('/', async (req, res) => {
    try {
        const { prompt, negativePrompt, width, height, steps, guidanceScale, model, seed, userId, projectId, selectionBounds, } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        if (!userId || !projectId) {
            return res.status(400).json({ error: 'userId and projectId are required' });
        }
        const request = {
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
        const result = await (0, diffusion_service_1.submitGeneration)(request);
        if (result.success) {
            res.status(202).json(result);
        }
        else {
            res.status(500).json({ error: result.error });
        }
    }
    catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * GET /api/generate/status/:jobId
 * Get status of a specific generation job
 */
router.get('/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const status = (0, diffusion_service_1.getGenerationStatus)(jobId);
    if (!status) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(status);
});
/**
 * GET /api/generate/jobs/:userId
 * Get all jobs for a user
 */
router.get('/jobs/:userId', (req, res) => {
    const { userId } = req.params;
    const jobs = (0, diffusion_service_1.getProjectJobs)(userId);
    res.json({ jobs });
});
/**
 * DELETE /api/generate/:jobId
 * Cancel a pending generation job
 */
router.delete('/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const cancelled = await (0, diffusion_service_1.cancelGeneration)(jobId);
    if (cancelled) {
        res.json({ success: true, message: 'Job cancelled' });
    }
    else {
        res.status(404).json({ error: 'Job not found or already completed' });
    }
});
/**
 * GET /api/generate/queue/stats
 * Get queue statistics
 */
router.get('/queue/stats', async (_req, res) => {
    try {
        const stats = await (0, diffusion_service_1.getGenerationQueueStats)();
        res.json(stats);
    }
    catch (error) {
        console.error('Queue stats error:', error);
        res.status(500).json({ error: 'Failed to get queue stats' });
    }
});
exports.default = router;
