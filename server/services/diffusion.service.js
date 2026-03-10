"use strict";
/**
 * Diffusion Service - Business logic for image generation
 * Provides methods for submitting jobs and querying status
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobStatus = exports.ModelType = void 0;
exports.submitGeneration = submitGeneration;
exports.getGenerationStatus = getGenerationStatus;
exports.getProjectJobs = getProjectJobs;
exports.cancelGeneration = cancelGeneration;
exports.getGenerationQueueStats = getGenerationQueueStats;
exports.setupGenerationNotifications = setupGenerationNotifications;
const diffusion_queue_1 = require("../queues/diffusion.queue");
Object.defineProperty(exports, "ModelType", { enumerable: true, get: function () { return diffusion_queue_1.ModelType; } });
Object.defineProperty(exports, "JobStatus", { enumerable: true, get: function () { return diffusion_queue_1.JobStatus; } });
// Validate dimensions (must be divisible by 8 for stable diffusion)
function validateDimensions(width, height) {
    return {
        width: Math.round(width / 8) * 8,
        height: Math.round(height / 8) * 8,
    };
}
/**
 * Submit a new generation request
 */
async function submitGeneration(request) {
    try {
        // Validate and normalize dimensions
        const dimensions = validateDimensions(request.width || 768, request.height || 768);
        // Map model string to enum
        const model = request.model === 'sdxl' ? diffusion_queue_1.ModelType.SDXL : diffusion_queue_1.ModelType.SD15;
        // Add job to queue
        const jobId = await (0, diffusion_queue_1.addGenerationJob)({
            prompt: request.prompt,
            negativePrompt: request.negativePrompt || 'blurry, bad quality, distorted, ugly, deformed',
            width: dimensions.width,
            height: dimensions.height,
            steps: request.steps || 30,
            guidanceScale: request.guidanceScale || 7.5,
            model,
            seed: request.seed,
            userId: request.userId,
            projectId: request.projectId,
            selectionBounds: request.selectionBounds,
        });
        // Get queue stats for estimated time
        const stats = await (0, diffusion_queue_1.getQueueStats)();
        const estimatedTime = model === diffusion_queue_1.ModelType.SD15
            ? 5 + (stats.waiting * 5) // 5 sec per SD15 job
            : 15 + (stats.waiting * 10); // 15 sec per SDXL job
        return {
            success: true,
            jobId,
            estimatedTime,
            queuePosition: stats.waiting + 1,
        };
    }
    catch (error) {
        console.error('Failed to submit generation:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Get status of a specific job
 */
function getGenerationStatus(jobId) {
    return (0, diffusion_queue_1.getJobStatus)(jobId);
}
/**
 * Get all jobs for a user/project
 */
function getProjectJobs(userId) {
    return (0, diffusion_queue_1.getUserJobs)(userId);
}
/**
 * Cancel a pending job
 */
async function cancelGeneration(jobId) {
    return (0, diffusion_queue_1.cancelJob)(jobId);
}
/**
 * Get overall queue statistics
 */
async function getGenerationQueueStats() {
    return (0, diffusion_queue_1.getQueueStats)();
}
/**
 * Set up WebSocket notification callback
 */
function setupGenerationNotifications(callback) {
    (0, diffusion_queue_1.setNotifyCallback)(callback);
}
