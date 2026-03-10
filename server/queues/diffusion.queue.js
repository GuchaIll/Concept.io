"use strict";
/**
 * Diffusion Queue - Manages generation job queue using BullMQ
 * Handles job scheduling, status tracking, and WebSocket notifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeQueue = exports.cancelJob = exports.updateJobStatus = exports.getQueueStats = exports.getQueuePosition = exports.getUserJobs = exports.getJobStatus = exports.addGenerationJob = exports.queueEvents = exports.diffusionQueue = exports.setNotifyCallback = exports.JobStatus = exports.ModelType = void 0;
const bullmq_1 = require("bullmq");
const uuid_1 = require("uuid");
// Redis connection config
const redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
};
// Diffusion service URL
const DIFFUSION_SERVICE_URL = process.env.DIFFUSION_SERVICE_URL || 'http://localhost:8000';
// Job types
var ModelType;
(function (ModelType) {
    ModelType["SD15"] = "sd15";
    ModelType["SDXL"] = "sdxl";
})(ModelType || (exports.ModelType = ModelType = {}));
var JobStatus;
(function (JobStatus) {
    JobStatus["PENDING"] = "pending";
    JobStatus["LOADING_MODEL"] = "loading_model";
    JobStatus["GENERATING"] = "generating";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
// In-memory job tracking (for demo - use Redis in production)
const jobStatusMap = new Map();
let notifyCallback = null;
const setNotifyCallback = (callback) => {
    notifyCallback = callback;
};
exports.setNotifyCallback = setNotifyCallback;
// Create the queue
exports.diffusionQueue = new bullmq_1.Queue('diffusion', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: {
            count: 100,
            age: 3600, // Keep completed jobs for 1 hour
        },
        removeOnFail: {
            count: 50,
        },
    },
});
// Queue events for tracking
exports.queueEvents = new bullmq_1.QueueEvents('diffusion', {
    connection: redisConnection,
});
// Add job to queue
const addGenerationJob = async (data) => {
    const jobId = (0, uuid_1.v4)();
    const jobData = {
        ...data,
        id: jobId,
        createdAt: new Date().toISOString(),
    };
    // Estimate time based on model
    const estimatedTime = data.model === ModelType.SD15 ? 5 : 15;
    // Initialize status
    jobStatusMap.set(jobId, {
        jobId,
        status: JobStatus.PENDING,
        progress: 0,
        estimatedTime,
    });
    // Add to queue with priority (SDXL has lower priority due to longer processing time)
    await exports.diffusionQueue.add('generate', jobData, {
        priority: data.model === ModelType.SD15 ? 1 : 2,
        jobId,
    });
    console.log(`Generation job ${jobId} added to queue`);
    // Notify client
    if (notifyCallback) {
        notifyCallback(data.userId, data.projectId, {
            type: 'generation:queued',
            payload: {
                jobId,
                status: JobStatus.PENDING,
                progress: 0,
                estimatedTime,
                position: await (0, exports.getQueuePosition)(jobId),
            },
        });
    }
    return jobId;
};
exports.addGenerationJob = addGenerationJob;
// Get job status
const getJobStatus = (jobId) => {
    return jobStatusMap.get(jobId);
};
exports.getJobStatus = getJobStatus;
// Get all jobs for a user
const getUserJobs = (userId) => {
    const jobs = [];
    jobStatusMap.forEach((job, id) => {
        jobs.push(job);
    });
    return jobs;
};
exports.getUserJobs = getUserJobs;
// Get queue position for a job
const getQueuePosition = async (jobId) => {
    const waiting = await exports.diffusionQueue.getWaiting();
    const index = waiting.findIndex(job => job.id === jobId);
    return index + 1;
};
exports.getQueuePosition = getQueuePosition;
// Get queue stats
const getQueueStats = async () => {
    const [waiting, active, completed, failed] = await Promise.all([
        exports.diffusionQueue.getWaitingCount(),
        exports.diffusionQueue.getActiveCount(),
        exports.diffusionQueue.getCompletedCount(),
        exports.diffusionQueue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
};
exports.getQueueStats = getQueueStats;
// Update job status (called by worker)
const updateJobStatus = (jobId, update, userId, projectId) => {
    const current = jobStatusMap.get(jobId);
    if (current) {
        const updated = { ...current, ...update };
        jobStatusMap.set(jobId, updated);
        // Notify client via WebSocket
        if (notifyCallback && userId && projectId) {
            notifyCallback(userId, projectId, {
                type: 'generation:progress',
                payload: updated,
            });
        }
    }
};
exports.updateJobStatus = updateJobStatus;
// Cancel a job
const cancelJob = async (jobId) => {
    const job = await exports.diffusionQueue.getJob(jobId);
    if (job) {
        await job.remove();
        jobStatusMap.delete(jobId);
        console.log(`Job ${jobId} cancelled`);
        return true;
    }
    return false;
};
exports.cancelJob = cancelJob;
// Initialize queue event listeners
exports.queueEvents.on('completed', ({ jobId, returnvalue }) => {
    console.log(`Job ${jobId} completed`);
});
exports.queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.log(`Job ${jobId} failed: ${failedReason}`);
});
exports.queueEvents.on('progress', ({ jobId, data }) => {
    console.log(`Job ${jobId} progress:`, data);
});
// Graceful shutdown
const closeQueue = async () => {
    await exports.diffusionQueue.close();
    await exports.queueEvents.close();
};
exports.closeQueue = closeQueue;
