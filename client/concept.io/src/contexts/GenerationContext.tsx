/**
 * Generation Context - Manages AI image generation state and WebSocket communication
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// Job status constants matching backend
export const JobStatus = {
  PENDING: 'pending',
  LOADING_MODEL: 'loading_model',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

// Generation job interface
export interface GenerationJob {
  jobId: string;
  prompt: string;
  status: JobStatusType;
  progress: number;
  estimatedTime?: number;
  queuePosition?: number;
  imageData?: string;
  error?: string;
  model: 'sd15' | 'sdxl';
  createdAt: string;
  completedAt?: string;
  selectionBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

// Generation request
export interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  model?: 'sd15' | 'sdxl';
  steps?: number;
  selectionBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

// Queue statistics
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

// Context state
interface GenerationState {
  jobs: GenerationJob[];
  activeJobId: string | null;
  isGenerating: boolean;
  queueStats: QueueStats;
  showQueuePanel: boolean;
}

// Context value
interface GenerationContextValue extends GenerationState {
  submitGeneration: (request: GenerationRequest) => Promise<string | null>;
  cancelJob: (jobId: string) => Promise<boolean>;
  getJob: (jobId: string) => GenerationJob | undefined;
  clearCompletedJobs: () => void;
  setShowQueuePanel: (show: boolean) => void;
  addGeneratedImageToCanvas: (jobId: string) => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

// API base URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const GenerationProvider: React.FC<{ 
  children: React.ReactNode;
  userId: string;
  projectId: string;
  socket: WebSocket | null;
  onImageGenerated?: (imageData: string, bounds?: { left: number; top: number; width: number; height: number }) => void;
}> = ({ children, userId, projectId, socket, onImageGenerated }) => {
  const [state, setState] = useState<GenerationState>({
    jobs: [],
    activeJobId: null,
    isGenerating: false,
    queueStats: { waiting: 0, active: 0, completed: 0, failed: 0 },
    showQueuePanel: false,
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle WebSocket messages for generation updates
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'generation:queued' || data.type === 'generation:progress') {
          const payload = data.payload;
          
          setState(prev => {
            const jobIndex = prev.jobs.findIndex(j => j.jobId === payload.jobId);
            
            if (jobIndex === -1) {
              // New job
              return {
                ...prev,
                jobs: [...prev.jobs, {
                  jobId: payload.jobId,
                  prompt: payload.prompt || '',
                  status: payload.status,
                  progress: payload.progress,
                  estimatedTime: payload.estimatedTime,
                  queuePosition: payload.position,
                  model: payload.model || 'sd15',
                  createdAt: new Date().toISOString(),
                  imageData: payload.imageData,
                  error: payload.error,
                  completedAt: payload.completedAt,
                }],
                isGenerating: payload.status !== JobStatus.COMPLETED && payload.status !== JobStatus.FAILED,
              };
            } else {
              // Update existing job
              const updatedJobs = [...prev.jobs];
              updatedJobs[jobIndex] = {
                ...updatedJobs[jobIndex],
                status: payload.status,
                progress: payload.progress,
                imageData: payload.imageData,
                error: payload.error,
                completedAt: payload.completedAt,
              };
              
              // Check if job completed with image
              if (payload.status === JobStatus.COMPLETED && payload.imageData && onImageGenerated) {
                onImageGenerated(payload.imageData, updatedJobs[jobIndex].selectionBounds);
              }
              
              return {
                ...prev,
                jobs: updatedJobs,
                isGenerating: updatedJobs.some(j => 
                  j.status !== JobStatus.COMPLETED && j.status !== JobStatus.FAILED
                ),
              };
            }
          });
        }
      } catch (error) {
        // Not a JSON message or not for us
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, onImageGenerated]);

  // Poll for job status when we have active jobs
  useEffect(() => {
    const activeJobs = state.jobs.filter(
      j => j.status !== JobStatus.COMPLETED && j.status !== JobStatus.FAILED
    );

    if (activeJobs.length > 0 && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(async () => {
        for (const job of activeJobs) {
          try {
            const response = await fetch(`${API_BASE}/api/generate/status/${job.jobId}`);
            if (response.ok) {
              const status = await response.json();
              
              setState(prev => {
                const jobIndex = prev.jobs.findIndex(j => j.jobId === job.jobId);
                if (jobIndex === -1) return prev;
                
                const updatedJobs = [...prev.jobs];
                updatedJobs[jobIndex] = {
                  ...updatedJobs[jobIndex],
                  status: status.status,
                  progress: status.progress,
                  imageData: status.imageData,
                  error: status.error,
                };
                
                // Handle completion
                if (status.status === JobStatus.COMPLETED && status.imageData && onImageGenerated) {
                  onImageGenerated(status.imageData, updatedJobs[jobIndex].selectionBounds);
                }
                
                return {
                  ...prev,
                  jobs: updatedJobs,
                  isGenerating: updatedJobs.some(j => 
                    j.status !== JobStatus.COMPLETED && j.status !== JobStatus.FAILED
                  ),
                };
              });
            }
          } catch (error) {
            console.error('Failed to poll job status:', error);
          }
        }
      }, 1000);
    } else if (activeJobs.length === 0 && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [state.jobs, onImageGenerated]);

  // Submit a new generation request
  const submitGeneration = useCallback(async (request: GenerationRequest): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          userId,
          projectId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Generation failed');
      }

      const result = await response.json();
      
      // Add job to state
      setState(prev => ({
        ...prev,
        jobs: [...prev.jobs, {
          jobId: result.jobId,
          prompt: request.prompt,
          status: JobStatus.PENDING,
          progress: 0,
          estimatedTime: result.estimatedTime,
          queuePosition: result.queuePosition,
          model: request.model || 'sd15',
          createdAt: new Date().toISOString(),
          selectionBounds: request.selectionBounds,
        }],
        activeJobId: result.jobId,
        isGenerating: true,
        showQueuePanel: true,
      }));

      return result.jobId;
    } catch (error) {
      console.error('Submit generation failed:', error);
      return null;
    }
  }, [userId, projectId]);

  // Cancel a job
  const cancelJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/api/generate/${jobId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setState(prev => ({
          ...prev,
          jobs: prev.jobs.filter(j => j.jobId !== jobId),
          activeJobId: prev.activeJobId === jobId ? null : prev.activeJobId,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Cancel job failed:', error);
      return false;
    }
  }, []);

  // Get a specific job
  const getJob = useCallback((jobId: string): GenerationJob | undefined => {
    return state.jobs.find(j => j.jobId === jobId);
  }, [state.jobs]);

  // Clear completed jobs
  const clearCompletedJobs = useCallback(() => {
    setState(prev => ({
      ...prev,
      jobs: prev.jobs.filter(j => 
        j.status !== JobStatus.COMPLETED && j.status !== JobStatus.FAILED
      ),
    }));
  }, []);

  // Set queue panel visibility
  const setShowQueuePanel = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, showQueuePanel: show }));
  }, []);

  // Add generated image to canvas (placeholder - to be connected to canvas context)
  const addGeneratedImageToCanvas = useCallback((jobId: string) => {
    const job = state.jobs.find(j => j.jobId === jobId);
    if (job?.imageData && onImageGenerated) {
      onImageGenerated(job.imageData, job.selectionBounds);
    }
  }, [state.jobs, onImageGenerated]);

  const value: GenerationContextValue = {
    ...state,
    submitGeneration,
    cancelJob,
    getJob,
    clearCompletedJobs,
    setShowQueuePanel,
    addGeneratedImageToCanvas,
  };

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
};

export const useGeneration = () => {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error('useGeneration must be used within a GenerationProvider');
  }
  return context;
};

export default GenerationContext;
