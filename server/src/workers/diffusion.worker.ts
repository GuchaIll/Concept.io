/**
 * Diffusion Worker - Processes generation jobs from the queue
 * Communicates with Python diffusion service for actual image generation
 */

import { Worker, Job } from 'bullmq';
import {
  GenerationJobData,
  JobStatus,
  ModelType,
  updateJobStatus,
} from '../queues/diffusion.queue';

// Redis connection config
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Diffusion service URL
const DIFFUSION_SERVICE_URL = process.env.DIFFUSION_SERVICE_URL || 'http://127.0.0.1:8000';

// Poll interval for checking generation status (ms)
const POLL_INTERVAL = 500;

/**
 * Call the Python diffusion service to generate an image
 */
async function callDiffusionService(jobData: GenerationJobData): Promise<string> {
  const response = await fetch(`${DIFFUSION_SERVICE_URL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: jobData.prompt,
      negative_prompt: jobData.negativePrompt,
      width: jobData.width,
      height: jobData.height,
      steps: jobData.steps,
      guidance_scale: jobData.guidanceScale,
      model: jobData.model,
      seed: jobData.seed,
    }),
  });

  if (!response.ok) {
    throw new Error(`Diffusion service error: ${response.status}`);
  }

  const result = await response.json();
  return result.job_id;
}

/**
 * Poll the diffusion service for job status
 */
async function pollJobStatus(diffusionJobId: string): Promise<{
  status: string;
  progress: number;
  imageData?: string;
  error?: string;
}> {
  const response = await fetch(`${DIFFUSION_SERVICE_URL}/job/${diffusionJobId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.status}`);
  }

  return response.json();
}

/**
 * Process a generation job
 * Strategy: First run SD 1.5 for quick preview, then SDXL for high quality
 */
async function processGenerationJob(job: Job<GenerationJobData>): Promise<string> {
  const { data } = job;
  console.log(`Processing generation job ${data.id}: "${data.prompt}"`);

  try {
    // Update status to loading model
    updateJobStatus(data.id, { status: JobStatus.LOADING_MODEL }, data.userId, data.projectId);
    
    // Start generation on Python service
    const diffusionJobId = await callDiffusionService(data);
    console.log(`Started diffusion job ${diffusionJobId} for queue job ${data.id}`);

    // Poll for completion
    let completed = false;
    let imageData: string | undefined;
    
    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      
      const status = await pollJobStatus(diffusionJobId);
      
      // Map diffusion service status to our status
      let jobStatus: JobStatus;
      switch (status.status) {
        case 'loading_model':
          jobStatus = JobStatus.LOADING_MODEL;
          break;
        case 'generating':
          jobStatus = JobStatus.GENERATING;
          break;
        case 'completed':
          jobStatus = JobStatus.COMPLETED;
          completed = true;
          imageData = status.imageData;
          break;
        case 'failed':
          throw new Error(status.error || 'Generation failed');
        default:
          jobStatus = JobStatus.PENDING;
      }
      
      // Update progress
      updateJobStatus(
        data.id,
        {
          status: jobStatus,
          progress: status.progress,
        },
        data.userId,
        data.projectId
      );
      
      // Update job progress for BullMQ
      await job.updateProgress(status.progress);
    }

    // Final update with completed image
    updateJobStatus(
      data.id,
      {
        status: JobStatus.COMPLETED,
        progress: 100,
        imageData,
        completedAt: new Date().toISOString(),
      },
      data.userId,
      data.projectId
    );

    console.log(`Generation job ${data.id} completed successfully`);
    return imageData || '';

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Generation job ${data.id} failed:`, errorMessage);
    
    updateJobStatus(
      data.id,
      {
        status: JobStatus.FAILED,
        error: errorMessage,
      },
      data.userId,
      data.projectId
    );
    
    throw error;
  }
}

// Create the worker
export const diffusionWorker = new Worker<GenerationJobData>(
  'diffusion',
  processGenerationJob,
  {
    connection: redisConnection,
    concurrency: 1, // Process one job at a time (GPU limitation)
    limiter: {
      max: 10,
      duration: 60000, // Max 10 jobs per minute
    },
  }
);

// Worker event handlers
diffusionWorker.on('completed', (job, result) => {
  console.log(`Worker completed job ${job.id}`);
});

diffusionWorker.on('failed', (job, error) => {
  console.error(`Worker failed job ${job?.id}:`, error.message);
});

diffusionWorker.on('error', (error) => {
  console.error('Worker error:', error);
});

// Graceful shutdown
export const closeWorker = async () => {
  await diffusionWorker.close();
};

// Start worker if running as standalone
if (require.main === module) {
  console.log('Diffusion worker started');
  
  process.on('SIGTERM', async () => {
    console.log('Shutting down worker...');
    await closeWorker();
    process.exit(0);
  });
}
