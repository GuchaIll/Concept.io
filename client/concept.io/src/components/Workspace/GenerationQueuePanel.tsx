/**
 * Generation Queue Panel - Shows generation jobs and their status
 */

import React, { useState } from 'react';

// Job status types
export type JobStatus = 'pending' | 'loading_model' | 'generating' | 'completed' | 'failed';

// Generation job interface (simplified)
export interface GenerationJob {
  id: string;
  prompt: string;
  status: JobStatus;
  progress: number;
  imageData?: string;
  error?: string;
}

interface GenerationQueuePanelProps {
  jobs: GenerationJob[];
  onClose?: () => void;
  onCancelJob?: (jobId: string) => void;
  onAddToCanvas?: (job: GenerationJob) => void;
  onClearCompleted?: () => void;
}

const JobStatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => {
  const statusConfig: Record<JobStatus, { color: string; icon: string; label: string }> = {
    'pending': { color: 'bg-yellow-500/20 text-yellow-400', icon: 'schedule', label: 'Queued' },
    'loading_model': { color: 'bg-blue-500/20 text-blue-400', icon: 'memory', label: 'Loading' },
    'generating': { color: 'bg-primary/20 text-primary', icon: 'auto_awesome', label: 'Generating' },
    'completed': { color: 'bg-green-500/20 text-green-400', icon: 'check_circle', label: 'Done' },
    'failed': { color: 'bg-red-500/20 text-red-400', icon: 'error', label: 'Failed' },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${config.color}`}>
      <span className="material-icons-round text-xs">{config.icon}</span>
      {config.label}
    </span>
  );
};

const JobCard: React.FC<{ 
  job: GenerationJob; 
  onCancel: () => void;
  onAddToCanvas: () => void;
}> = ({ job, onCancel, onAddToCanvas }) => {
  const isActive = job.status === 'generating' || job.status === 'loading_model';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';

  return (
    <div className={`p-3 rounded-xl border transition-all ${
      isActive 
        ? 'bg-primary/5 border-primary/30' 
        : 'bg-white/5 border-white/10'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate" title={job.prompt}>
            {job.prompt}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <JobStatusBadge status={job.status} />
          </div>
        </div>
        
        {/* Actions */}
        {(job.status === 'pending' || isActive) && (
          <button
            onClick={onCancel}
            className="p-1 text-white/30 hover:text-red-400 transition-colors"
            title="Cancel"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {isActive && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-white/50 mb-1">
            <span>Progress</span>
            <span>{Math.round(job.progress)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Preview Image */}
      {isCompleted && job.imageData && (
        <div className="mt-2">
          <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20">
            <img 
              src={job.imageData} 
              alt="Generated" 
              className="w-full h-full object-contain"
            />
          </div>
          <button
            onClick={onAddToCanvas}
            className="w-full mt-2 py-2 bg-primary/20 text-primary rounded-lg text-xs font-bold hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-1"
          >
            <span className="material-icons-round text-sm">add</span>
            Add to Canvas
          </button>
        </div>
      )}

      {/* Error Message */}
      {isFailed && job.error && (
        <p className="text-[10px] text-red-400 mt-2">
          Error: {job.error}
        </p>
      )}
    </div>
  );
};

export const GenerationQueuePanel: React.FC<GenerationQueuePanelProps> = ({
  jobs = [],
  onClose,
  onCancelJob,
  onAddToCanvas,
  onClearCompleted,
}) => {
  const [minimized, setMinimized] = useState(false);

  const isGenerating = jobs.some(j => j.status === 'generating' || j.status === 'loading_model');

  const activeJobs = jobs.filter(j =>
    j.status === 'pending' ||
    j.status === 'loading_model' ||
    j.status === 'generating'
  );

  const completedJobs = jobs.filter(j =>
    j.status === 'completed' ||
    j.status === 'failed'
  );

  return (
    <div className="absolute bottom-24 right-6 w-80 z-40">
      <div
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(10, 12, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-base text-primary">auto_awesome</span>
            <h3 className="text-sm font-bold text-white">Generation Queue</h3>
            {isGenerating && (
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
            {minimized && jobs.length > 0 && (
              <span className="text-[10px] font-bold text-white/40 border border-white/15 rounded-full px-1.5 py-0.5">
                {activeJobs.length > 0 ? `${activeJobs.length} active` : `${completedJobs.length} done`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized(v => !v)}
              className="p-1 text-white/30 hover:text-white transition-colors"
              title={minimized ? 'Expand' : 'Minimize'}
            >
              <span className="material-icons-round text-lg">
                {minimized ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-white/30 hover:text-white transition-colors"
              title="Close"
            >
              <span className="material-icons-round text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Content — hidden when minimized */}
        {!minimized && (
          <>
            <div className="max-h-[400px] overflow-y-auto">
              {jobs.length === 0 ? (
                <div className="p-8 text-center">
                  <span className="material-icons-round text-4xl text-white/20 mb-2">image</span>
                  <p className="text-sm text-white/40">No generation jobs</p>
                  <p className="text-xs text-white/30 mt-1">
                    Select an area and type a prompt to generate
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {activeJobs.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">
                        Active ({activeJobs.length})
                      </h4>
                      <div className="space-y-2">
                        {activeJobs.map(job => (
                          <JobCard
                            key={job.id}
                            job={job}
                            onCancel={() => onCancelJob?.(job.id)}
                            onAddToCanvas={() => onAddToCanvas?.(job)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {completedJobs.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                          Completed ({completedJobs.length})
                        </h4>
                        <button
                          type="button"
                          onClick={onClearCompleted}
                          className="text-[10px] text-white/30 hover:text-white transition-colors"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="space-y-2">
                        {completedJobs.map(job => (
                          <JobCard
                            key={job.id}
                            job={job}
                            onCancel={() => onCancelJob?.(job.id)}
                            onAddToCanvas={() => onAddToCanvas?.(job)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[10px]">
              <span className="text-white/40">
                {activeJobs.length} active · {completedJobs.length} completed
              </span>
              <span className="text-primary flex items-center gap-1">
                <span className="material-icons-round text-xs">memory</span>
                GPU Ready
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GenerationQueuePanel;
