/**
 * Diffusion Queue - Manages generation job queue using BullMQ
 * Handles job scheduling, status tracking, and WebSocket notifications
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

// Redis connection config
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Diffusion service URL
const DIFFUSION_SERVICE_URL = process.env.DIFFUSION_SERVICE_URL || 'http://localhost:8000';

// Job types
export enum ModelType {
  SD15 = 'sd15',
  SDXL = 'sdxl',
}

export enum JobStatus {
  PENDING = 'pending',
  LOADING_MODEL = 'loading_model',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Job data interface
export interface GenerationJobData {
  id: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  model: ModelType;
  seed?: number;
  userId: string;
  projectId: string;
  selectionBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  createdAt: string;
}

export interface GenerationJobResult {
  jobId: string;
  status: JobStatus;
  progress: number;
  estimatedTime?: number;
  imageData?: string;
  error?: string;
  completedAt?: string;
}

// In-memory job tracking (for demo - use Redis in production)
const jobStatusMap = new Map<string, GenerationJobResult>();

// WebSocket notification callback
type NotifyCallback = (userId: string, projectId: string, data: any) => void;
let notifyCallback: NotifyCallback | null = null;

export const setNotifyCallback = (callback: NotifyCallback) => {
  notifyCallback = callback;
};

// Create the queue
export const diffusionQueue = new Queue<GenerationJobData>('diffusion', {
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
export const queueEvents = new QueueEvents('diffusion', {
  connection: redisConnection,
});

// Add job to queue
export const addGenerationJob = async (data: Omit<GenerationJobData, 'id' | 'createdAt'>): Promise<string> => {
  const jobId = uuidv4();
  const jobData: GenerationJobData = {
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
  await diffusionQueue.add('generate', jobData, {
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
        position: await getQueuePosition(jobId),
      },
    });
  }

  return jobId;
};

// Get job status
export const getJobStatus = (jobId: string): GenerationJobResult | undefined => {
  return jobStatusMap.get(jobId);
};

// Get all jobs for a user
export const getUserJobs = (userId: string): GenerationJobResult[] => {
  const jobs: GenerationJobResult[] = [];
  jobStatusMap.forEach((job, id) => {
    jobs.push(job);
  });
  return jobs;
};

// Get queue position for a job
export const getQueuePosition = async (jobId: string): Promise<number> => {
  const waiting = await diffusionQueue.getWaiting();
  const index = waiting.findIndex(job => job.id === jobId);
  return index + 1;
};

// Get queue stats
export const getQueueStats = async () => {
  const [waiting, active, completed, failed] = await Promise.all([
    diffusionQueue.getWaitingCount(),
    diffusionQueue.getActiveCount(),
    diffusionQueue.getCompletedCount(),
    diffusionQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
};

// Update job status (called by worker)
export const updateJobStatus = (
  jobId: string,
  update: Partial<GenerationJobResult>,
  userId?: string,
  projectId?: string
) => {
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

// Cancel a job
export const cancelJob = async (jobId: string): Promise<boolean> => {
  const job = await diffusionQueue.getJob(jobId);
  if (job) {
    await job.remove();
    jobStatusMap.delete(jobId);
    console.log(`Job ${jobId} cancelled`);
    return true;
  }
  return false;
};

// Initialize queue event listeners
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.log(`Job ${jobId} failed: ${failedReason}`);
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} progress:`, data);
});

// Graceful shutdown
export const closeQueue = async () => {
  await diffusionQueue.close();
  await queueEvents.close();
};
