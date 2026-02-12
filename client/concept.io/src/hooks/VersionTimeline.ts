import { useState, useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import type { 
  ISnapshot, 
  IBranch, 
  ILayerSnapshot, 
  VersionTimelineState,
  BranchTree 
} from '../types/version.interface';
import type { Layer } from './Layer';

// Default branch colors for visual differentiation
const BRANCH_COLORS = [
  '#2b6cee', // primary blue
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
];

// API base URL for REST endpoints
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface UseVersionTimelineProps {
  canvas: fabric.Canvas | null;
  layers: Layer[];
  projectId: string;
  userId: string;
  socket?: WebSocket | null; // Optional WebSocket for real-time sync
}

export const useVersionTimeline = ({
  canvas,
  layers,
  projectId,
  userId,
  socket,
}: UseVersionTimelineProps) => {
  const [state, setState] = useState<VersionTimelineState>({
    branches: [],
    snapshots: [],
    currentBranchId: '',
    currentSnapshotId: null,
    selectedSnapshotId: null,
    isLoading: false,
    error: null,
  });

  const initialized = useRef(false);
  const socketListenersAttached = useRef(false);

  // ============================================
  // WebSocket Event Handlers
  // ============================================

  // Handle incoming WebSocket messages
  const handleSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'version:sync':
          console.log('Received version sync:', data.payload);
          setState(prev => ({
            ...prev,
            branches: data.payload.branches || [],
            snapshots: data.payload.snapshots || [],
            currentBranchId: data.payload.currentBranchId || prev.currentBranchId,
            isLoading: false,
          }));
          break;

        case 'version:snapshot:created':
          console.log('Snapshot created:', data.payload);
          setState(prev => {
            // Avoid duplicates
            if (prev.snapshots.some(s => s.id === data.payload.id)) {
              return prev;
            }
            // Update branch head
            const updatedBranches = prev.branches.map(branch =>
              branch.id === data.payload.branchId
                ? { ...branch, headSnapshotId: data.payload.id }
                : branch
            );
            return {
              ...prev,
              snapshots: [...prev.snapshots, data.payload],
              branches: updatedBranches,
              currentSnapshotId: data.payload.id,
              isLoading: false,
            };
          });
          break;

        case 'version:snapshot:restored':
          console.log('Snapshot restored:', data.payload);
          // Optionally trigger canvas restore for collaborators
          break;

        case 'version:snapshot:deleted':
          console.log('Snapshot deleted:', data.payload);
          setState(prev => ({
            ...prev,
            snapshots: prev.snapshots.filter(s => s.id !== data.payload.snapshotId),
          }));
          break;

        case 'version:branch:created':
          console.log('Branch created:', data.payload);
          setState(prev => {
            if (prev.branches.some(b => b.id === data.payload.id)) {
              return prev;
            }
            return {
              ...prev,
              branches: [...prev.branches, data.payload],
            };
          });
          break;

        case 'version:branch:switched':
          console.log('Branch switched by collaborator:', data.payload);
          // Only update if it's the same user or you want to follow
          break;

        case 'version:branch:deleted':
          console.log('Branch deleted:', data.payload);
          setState(prev => ({
            ...prev,
            branches: prev.branches.filter(b => b.id !== data.payload.branchId),
            snapshots: prev.snapshots.filter(s => s.branchId !== data.payload.branchId),
          }));
          break;

        case 'version:branch:merged':
          console.log('Branches merged:', data.payload);
          setState(prev => {
            const updatedBranches = prev.branches.map(branch =>
              branch.id === data.payload.targetBranchId
                ? { ...branch, headSnapshotId: data.payload.newSnapshot.id }
                : branch
            );
            return {
              ...prev,
              branches: updatedBranches,
              snapshots: [...prev.snapshots, data.payload.newSnapshot],
            };
          });
          break;

        case 'version:error':
          console.error('Version control error:', data.payload);
          setState(prev => ({
            ...prev,
            error: data.payload.message,
            isLoading: false,
          }));
          break;

        default:
          // Ignore non-version events
          break;
      }
    } catch (error) {
      // Ignore non-JSON messages or parsing errors
    }
  }, []);

  // Send message via WebSocket
  const sendSocketMessage = useCallback((type: string, payload: any) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send:', type);
      return false;
    }

    socket.send(JSON.stringify({
      type,
      payload,
      userId,
      roomId: projectId,
    }));
    return true;
  }, [socket, userId, projectId]);

  // ============================================
  // Initialization & WebSocket Setup
  // ============================================

  // Attach WebSocket listeners
  useEffect(() => {
    if (!socket || socketListenersAttached.current) return;
    
    socket.addEventListener('message', handleSocketMessage);
    socketListenersAttached.current = true;

    // Request initial sync when socket is ready
    if (socket.readyState === WebSocket.OPEN) {
      sendSocketMessage('version:sync:request', {});
    } else {
      socket.addEventListener('open', () => {
        sendSocketMessage('version:sync:request', {});
      }, { once: true });
    }

    return () => {
      socket.removeEventListener('message', handleSocketMessage);
      socketListenersAttached.current = false;
    };
  }, [socket, handleSocketMessage, sendSocketMessage]);

  // Fetch initial data via REST API (fallback if no socket)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // If socket is available, it will handle initialization
    if (socket) return;

    // Fallback: fetch via REST API
    const fetchVersionData = async () => {
      setState(prev => ({ ...prev, isLoading: true }));
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/version`);
        const result = await response.json();
        
        if (result.success) {
          setState(prev => ({
            ...prev,
            branches: result.data.branches,
            snapshots: result.data.snapshots,
            currentBranchId: result.data.branches[0]?.id || '',
            isLoading: false,
          }));
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('Failed to fetch version data:', error);
        // Create default main branch locally
        const mainBranch: IBranch = {
          id: uuidv4(),
          projectId,
          name: 'main',
          headSnapshotId: '',
          createdBy: userId,
          createdAt: Date.now(),
          color: BRANCH_COLORS[0],
        };
        setState(prev => ({
          ...prev,
          branches: [mainBranch],
          currentBranchId: mainBranch.id,
          isLoading: false,
        }));
      }
    };

    fetchVersionData();
  }, [projectId, userId, socket]);

  // ============================================
  // Helper Functions
  // ============================================

  // Generate thumbnail from canvas
  const generateThumbnail = useCallback((): string => {
    if (!canvas) return '';
    
    try {
      return canvas.toDataURL({
        format: 'jpeg',
        quality: 0.7,
        multiplier: 0.25,
      });
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return '';
    }
  }, [canvas]);

  // Serialize current layer state
  const serializeLayers = useCallback((): ILayerSnapshot[] => {
    if (!canvas) return [];

    return layers.map((layer, index) => {
      const layerObjects = canvas.getObjects().filter(obj => obj.layerId === layer.id);
      const serializedObjects = layerObjects.map(obj => obj.toJSON());

      return {
        layerId: layer.id,
        name: layer.name,
        type: layer.type,
        objects: JSON.stringify(serializedObjects),
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode || 'normal',
        zIndex: index,
      };
    });
  }, [canvas, layers]);

  // Create a new snapshot (commit)
  const createSnapshot = useCallback((
    name: string,
    description?: string
  ): ISnapshot | null => {
    const currentBranch = state.branches.find(b => b.id === state.currentBranchId);
    if (!currentBranch) {
      setState(prev => ({ ...prev, error: 'No active branch' }));
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // If canvas is available, serialize layers; otherwise use empty array
      const snapshotLayers = canvas ? serializeLayers() : [];
      const snapshotThumbnail = canvas ? generateThumbnail() : '';

      // Send to server - the server will broadcast back with the created snapshot
      // Don't add locally to avoid duplicates
      const sent = sendSocketMessage('version:snapshot:create', {
        name,
        description,
        layers: snapshotLayers,
        thumbnail: snapshotThumbnail,
        branchId: state.currentBranchId,
      });

      if (!sent) {
        // If WebSocket not available, create locally as fallback
        const snapshot: ISnapshot = {
          id: uuidv4(),
          projectId,
          branchId: state.currentBranchId,
          name,
          description,
          layers: snapshotLayers,
          thumbnail: snapshotThumbnail,
          createdBy: userId,
          createdAt: Date.now(),
          parentSnapshotId: currentBranch.headSnapshotId || undefined,
        };

        const updatedBranches = state.branches.map(branch =>
          branch.id === state.currentBranchId
            ? { ...branch, headSnapshotId: snapshot.id }
            : branch
        );

        setState(prev => ({
          ...prev,
          snapshots: [...prev.snapshots, snapshot],
          branches: updatedBranches,
          currentSnapshotId: snapshot.id,
          isLoading: false,
          error: null,
        }));

        console.log('Snapshot created locally:', snapshot.name);
        return snapshot;
      }

      // WebSocket sent successfully - state will be updated via broadcast
      console.log('Snapshot creation request sent:', name);
      return null; // Return null since actual snapshot will come from server
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to create snapshot',
      }));
      return null;
    }
  }, [canvas, state.branches, state.currentBranchId, projectId, userId, serializeLayers, generateThumbnail, sendSocketMessage]);

  // Restore a snapshot
  const restoreSnapshot = useCallback((snapshotId: string): boolean => {
    if (!canvas) return false;

    const snapshot = state.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      setState(prev => ({ ...prev, error: 'Snapshot not found' }));
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Clear current canvas
      canvas.clear();
      canvas.backgroundColor = 'white';

      // Restore each layer's objects
      snapshot.layers.forEach(layerSnapshot => {
        const objects = JSON.parse(layerSnapshot.objects);
        
        objects.forEach((objData: any) => {
          fabric.util.enlivenObjects([objData]).then((enlivenedObjects) => {
            enlivenedObjects.forEach((obj: fabric.Object) => {
              obj.layerId = layerSnapshot.layerId;
              obj.visible = layerSnapshot.visible;
              obj.opacity = (obj.opacity || 1) * layerSnapshot.opacity;
              canvas.add(obj);
            });
            canvas.requestRenderAll();
          });
        });
      });

      setState(prev => ({
        ...prev,
        currentSnapshotId: snapshotId,
        currentBranchId: snapshot.branchId,
        isLoading: false,
        error: null,
      }));

      // Notify collaborators via WebSocket
      sendSocketMessage('version:snapshot:restore', { snapshotId });

      console.log('Snapshot restored:', snapshot.name);
      return true;
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to restore snapshot',
      }));
      return false;
    }
  }, [canvas, state.snapshots, sendSocketMessage]);

  // Create a new branch from current state or specific snapshot
  const createBranch = useCallback((
    name: string,
    fromSnapshotId?: string,
    color?: string
  ): IBranch | null => {
    // Check if branch name already exists
    if (state.branches.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setState(prev => ({ ...prev, error: 'Branch name already exists' }));
      return null;
    }

    const colorIndex = state.branches.length % BRANCH_COLORS.length;
    const baseSnapshotId = fromSnapshotId || state.currentSnapshotId || '';
    const branchColor = color || BRANCH_COLORS[colorIndex];

    // Send to server - the server will broadcast back with the created branch
    const sent = sendSocketMessage('version:branch:create', {
      name,
      fromSnapshotId: baseSnapshotId,
      color: branchColor,
    });

    if (!sent) {
      // If WebSocket not available, create locally as fallback
      const newBranch: IBranch = {
        id: uuidv4(),
        projectId,
        name,
        headSnapshotId: baseSnapshotId,
        createdBy: userId,
        createdAt: Date.now(),
        color: branchColor,
      };

      setState(prev => ({
        ...prev,
        branches: [...prev.branches, newBranch],
        error: null,
      }));

      console.log('Branch created locally:', name);
      return newBranch;
    }

    console.log('Branch creation request sent:', name);
    return null; // Return null since actual branch will come from server
  }, [state.branches, state.currentSnapshotId, projectId, userId, sendSocketMessage]);

  // Switch to a different branch
  const switchBranch = useCallback((branchId: string): boolean => {
    const branch = state.branches.find(b => b.id === branchId);
    if (!branch) {
      setState(prev => ({ ...prev, error: 'Branch not found' }));
      return false;
    }

    setState(prev => ({
      ...prev,
      currentBranchId: branchId,
      error: null,
    }));

    // If branch has a head snapshot, restore it
    if (branch.headSnapshotId) {
      restoreSnapshot(branch.headSnapshotId);
    }

    // Notify collaborators via WebSocket
    sendSocketMessage('version:branch:switch', { branchId });

    console.log('Switched to branch:', branch.name);
    return true;
  }, [state.branches, restoreSnapshot, sendSocketMessage]);

  // Delete a branch (cannot delete main or current branch)
  const deleteBranch = useCallback((branchId: string): boolean => {
    const branch = state.branches.find(b => b.id === branchId);
    if (!branch) {
      setState(prev => ({ ...prev, error: 'Branch not found' }));
      return false;
    }

    if (branch.name === 'main') {
      setState(prev => ({ ...prev, error: 'Cannot delete main branch' }));
      return false;
    }

    if (branchId === state.currentBranchId) {
      setState(prev => ({ ...prev, error: 'Cannot delete current branch' }));
      return false;
    }

    // Remove branch and its snapshots
    setState(prev => ({
      ...prev,
      branches: prev.branches.filter(b => b.id !== branchId),
      snapshots: prev.snapshots.filter(s => s.branchId !== branchId),
      error: null,
    }));

    // Notify collaborators via WebSocket
    sendSocketMessage('version:branch:delete', { branchId });

    console.log('Branch deleted:', branch.name);
    return true;
  }, [state.branches, state.currentBranchId, sendSocketMessage]);

  // Merge a branch into another (source -> target)
  const mergeBranch = useCallback((
    sourceBranchId: string,
    targetBranchId: string
  ): ISnapshot | null => {
    const sourceBranch = state.branches.find(b => b.id === sourceBranchId);
    const targetBranch = state.branches.find(b => b.id === targetBranchId);

    if (!sourceBranch || !targetBranch) {
      setState(prev => ({ ...prev, error: 'Branch not found' }));
      return null;
    }

    const sourceHead = state.snapshots.find(s => s.id === sourceBranch.headSnapshotId);
    if (!sourceHead) {
      setState(prev => ({ ...prev, error: 'Source branch has no snapshots' }));
      return null;
    }

    // Create a merge snapshot on the target branch
    const mergeSnapshot: ISnapshot = {
      id: uuidv4(),
      projectId,
      branchId: targetBranchId,
      name: `Merge: ${sourceBranch.name} → ${targetBranch.name}`,
      description: `Merged changes from branch "${sourceBranch.name}"`,
      layers: sourceHead.layers, // Take source branch's layers
      thumbnail: sourceHead.thumbnail,
      createdBy: userId,
      createdAt: Date.now(),
      parentSnapshotId: targetBranch.headSnapshotId || undefined,
    };

    // Update target branch head
    const updatedBranches = state.branches.map(branch =>
      branch.id === targetBranchId
        ? { ...branch, headSnapshotId: mergeSnapshot.id }
        : branch
    );

    setState(prev => ({
      ...prev,
      snapshots: [...prev.snapshots, mergeSnapshot],
      branches: updatedBranches,
      error: null,
    }));

    // Notify collaborators via WebSocket
    sendSocketMessage('version:branch:merge', {
      sourceBranchId,
      targetBranchId,
    });

    console.log('Branches merged:', sourceBranch.name, '→', targetBranch.name);
    return mergeSnapshot;
  }, [state.branches, state.snapshots, projectId, userId, sendSocketMessage]);

  // Select a snapshot for preview (without restoring)
  const selectSnapshot = useCallback((snapshotId: string | null) => {
    setState(prev => ({
      ...prev,
      selectedSnapshotId: snapshotId,
    }));
  }, []);

  // Get snapshots organized by branch
  const getBranchTrees = useCallback((): BranchTree[] => {
    return state.branches.map(branch => {
      const branchSnapshots = state.snapshots
        .filter(s => s.branchId === branch.id)
        .sort((a, b) => a.createdAt - b.createdAt);

      const headSnapshot = branchSnapshots.find(s => s.id === branch.headSnapshotId) || null;

      return {
        branch,
        snapshots: branchSnapshots,
        headSnapshot,
      };
    });
  }, [state.branches, state.snapshots]);

  // Get current branch
  const getCurrentBranch = useCallback((): IBranch | null => {
    return state.branches.find(b => b.id === state.currentBranchId) || null;
  }, [state.branches, state.currentBranchId]);

  // Get current snapshot
  const getCurrentSnapshot = useCallback((): ISnapshot | null => {
    return state.snapshots.find(s => s.id === state.currentSnapshotId) || null;
  }, [state.snapshots, state.currentSnapshotId]);

  // Get selected snapshot (for preview)
  const getSelectedSnapshot = useCallback((): ISnapshot | null => {
    return state.snapshots.find(s => s.id === state.selectedSnapshotId) || null;
  }, [state.snapshots, state.selectedSnapshotId]);

  return {
    // State
    branches: state.branches,
    snapshots: state.snapshots,
    currentBranchId: state.currentBranchId,
    currentSnapshotId: state.currentSnapshotId,
    selectedSnapshotId: state.selectedSnapshotId,
    isLoading: state.isLoading,
    error: state.error,

    // Actions
    createSnapshot,
    restoreSnapshot,
    createBranch,
    switchBranch,
    deleteBranch,
    mergeBranch,
    selectSnapshot,

    // Getters
    getBranchTrees,
    getCurrentBranch,
    getCurrentSnapshot,
    getSelectedSnapshot,
  };
};
