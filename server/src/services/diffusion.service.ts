/**
 * Diffusion Service - Business logic for image generation
 * Provides methods for submitting jobs and querying status
 */

import {
  addGenerationJob,
  getJobStatus,
  getUserJobs,
  getQueueStats,
  cancelJob,
  ModelType,
  JobStatus,
  GenerationJobResult,
  setNotifyCallback,
} from '../queues/diffusion.queue';

export interface GenerateRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidanceScale?: number;
  model?: 'sd15' | 'sdxl';
  seed?: number;
  userId: string;
  projectId: string;
  selectionBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface GenerateResponse {
  success: boolean;
  jobId?: string;
  error?: string;
  estimatedTime?: number;
  queuePosition?: number;
}

// Validate dimensions (must be divisible by 8 for stable diffusion)
function validateDimensions(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.round(width / 8) * 8,
    height: Math.round(height / 8) * 8,
  };
}

/**
 * Submit a new generation request
 */
export async function submitGeneration(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    // Validate and normalize dimensions
    const dimensions = validateDimensions(
      request.width || 768,
      request.height || 768
    );

    // Map model string to enum
    const model = request.model === 'sdxl' ? ModelType.SDXL : ModelType.SD15;

    // Add job to queue
    const jobId = await addGenerationJob({
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
    const stats = await getQueueStats();
    const estimatedTime = model === ModelType.SD15 
      ? 5 + (stats.waiting * 5)  // 5 sec per SD15 job
      : 15 + (stats.waiting * 10); // 15 sec per SDXL job

    return {
      success: true,
      jobId,
      estimatedTime,
      queuePosition: stats.waiting + 1,
    };
  } catch (error) {
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
export function getGenerationStatus(jobId: string): GenerationJobResult | undefined {
  return getJobStatus(jobId);
}

/**
 * Get all jobs for a user/project
 */
export function getProjectJobs(userId: string): GenerationJobResult[] {
  return getUserJobs(userId);
}

/**
 * Cancel a pending job
 */
export async function cancelGeneration(jobId: string): Promise<boolean> {
  return cancelJob(jobId);
}

/**
 * Get overall queue statistics
 */
export async function getGenerationQueueStats() {
  return getQueueStats();
}

/**
 * Set up WebSocket notification callback
 */
export function setupGenerationNotifications(
  callback: (userId: string, projectId: string, data: any) => void
) {
  setNotifyCallback(callback);
}

/**
 * Export types for use in other modules
 */
export { ModelType, JobStatus };
export type { GenerationJobResult };
