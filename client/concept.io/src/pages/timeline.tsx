import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TimelineFlow } from '../components/VersionTimeline';
import { useVersionContext } from '../contexts/VersionContext';
import { useWebSocket } from '../hooks/useWebSocket';

// Configuration - in production these would come from env/context
const PROJECT_ID = 'project-demo-1';
const USER_ID = 'user-demo-1';

const TimelinePage = () => {
  const navigate = useNavigate();
  
  // Connect to WebSocket for real-time sync
  const { socket, isConnected, error: wsError } = useWebSocket({
    projectId: PROJECT_ID,
    userId: USER_ID,
    autoConnect: true,
  });

  // Use shared version context
  const {
    branches,
    snapshots,
    currentBranchId,
    currentSnapshotId,
    selectedSnapshotId,
    isLoading,
    error,
    createSnapshot,
    restoreSnapshot,
    createBranch,
    switchBranch,
    deleteBranch,
    mergeBranch,
    selectSnapshot,
    setSocket,
  } = useVersionContext();

  // Connect socket to version context
  useMemo(() => {
    setSocket(socket);
  }, [socket, setSocket]);

  const handleCreateSnapshot = (name: string, description?: string) => {
    createSnapshot(name, description);
  };

  const handleRestoreSnapshot = useCallback((snapshotId: string) => {
    const success = restoreSnapshot(snapshotId);
    if (success) {
      // Navigate back to canvas after restore
      navigate('/canvas');
    }
  }, [restoreSnapshot, navigate]);

  const handleCreateBranch = (name: string, color?: string) => {
    createBranch(name, undefined, color);
  };

  const handleSwitchBranch = (branchId: string) => {
    switchBranch(branchId);
  };

  const handleDeleteBranch = (branchId: string) => {
    deleteBranch(branchId);
  };

  const handleMergeBranch = (sourceBranchId: string, targetBranchId: string) => {
    mergeBranch(sourceBranchId, targetBranchId);
  };

  const handleClose = () => {
    navigate('/canvas');
  };

  // Show connection status
  const connectionStatus = useMemo(() => {
    if (wsError) return { color: 'red', text: 'Connection Error' };
    if (isConnected) return { color: 'green', text: 'Connected' };
    return { color: 'yellow', text: 'Connecting...' };
  }, [isConnected, wsError]);

  // Get selected snapshot for display
  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);

  return (
    <div className="relative h-full">
      {/* Connection Status Indicator */}
      <div className="absolute top-20 right-6 z-50 flex items-center gap-2 bg-[#1a2130]/90 px-3 py-1.5 rounded-full border border-white/10">
        <div 
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: connectionStatus.color }}
        />
        <span className="text-[10px] font-medium text-white/70">{connectionStatus.text}</span>
      </div>

      {/* Error Display */}
      {(error || wsError) && (
        <div className="absolute top-32 right-6 z-50 bg-red-500/20 border border-red-500/50 px-4 py-2 rounded-lg">
          <p className="text-xs text-red-400">{error || wsError}</p>
        </div>
      )}

      {/* Selected Snapshot Info & Restore Button */}
      {selectedSnapshot && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-[#1a2130]/95 backdrop-blur border border-[#2b6cee]/30 px-4 py-3 rounded-xl flex items-center gap-4">
          <div className="flex items-center gap-3">
            {selectedSnapshot.thumbnail && (
              <img 
                src={selectedSnapshot.thumbnail} 
                alt={selectedSnapshot.name}
                className="w-12 h-12 rounded-lg object-cover border border-white/10"
              />
            )}
            <div>
              <p className="text-sm font-semibold text-white">{selectedSnapshot.name}</p>
              <p className="text-[10px] text-white/50">
                {selectedSnapshot.layers.length} layers • {new Date(selectedSnapshot.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleRestoreSnapshot(selectedSnapshot.id)}
            className="px-4 py-2 bg-[#2b6cee] text-white text-xs font-bold rounded-lg hover:bg-[#2b6cee]/80 flex items-center gap-1.5"
          >
            <span className="material-icons text-sm">restore</span>
            Restore
          </button>
        </div>
      )}

      {/* Timeline Flow Component */}
      <TimelineFlow
        branches={branches}
        snapshots={snapshots}
        currentBranchId={currentBranchId}
        currentSnapshotId={currentSnapshotId}
        selectedSnapshotId={selectedSnapshotId}
        isLoading={isLoading}
        projectName="Cyberpunk Interior v4"
        onCreateSnapshot={handleCreateSnapshot}
        onRestoreSnapshot={handleRestoreSnapshot}
        onSelectSnapshot={selectSnapshot}
        onCreateBranch={handleCreateBranch}
        onSwitchBranch={handleSwitchBranch}
        onDeleteBranch={handleDeleteBranch}
        onMergeBranch={handleMergeBranch}
        onClose={handleClose}
      />
    </div>
  );
};

export default TimelinePage;
