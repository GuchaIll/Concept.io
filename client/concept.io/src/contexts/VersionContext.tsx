import { createContext, useContext, type ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import type { 
  ISnapshot, 
  IBranch, 
  ILayerSnapshot, 
  VersionTimelineState,
  BranchTree 
} from '../types/version.interface';
import type { Layer } from '../hooks/Layer';

// API base URL for REST endpoints
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Default branch colors for visual differentiation
const BRANCH_COLORS = [
  '#2b6cee', // primary blue
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
];

interface VersionContextType {
  // State
  branches: IBranch[];
  snapshots: ISnapshot[];
  currentBranchId: string;
  currentSnapshotId: string | null;
  selectedSnapshotId: string | null;
  pendingRestoreSnapshotId: string | null; // Snapshot to restore when canvas is ready
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createSnapshot: (name: string, description?: string) => ISnapshot | null;
  updateCurrentSnapshot: () => void;
  restoreSnapshot: (snapshotId: string) => boolean;
  createBranch: (name: string, fromSnapshotId?: string, color?: string) => IBranch | null;
  switchBranch: (branchId: string) => boolean;
  deleteBranch: (branchId: string) => boolean;
  mergeBranch: (sourceBranchId: string, targetBranchId: string) => ISnapshot | null;
  selectSnapshot: (snapshotId: string | null) => void;
  clearPendingRestore: () => void;
  
  // Canvas connection
  setCanvas: (canvas: fabric.Canvas | null) => void;
  setLayers: (layers: Layer[]) => void;
  setSocket: (socket: WebSocket | null) => void;
  
  // Getters
  getBranchTrees: () => BranchTree[];
  getCurrentBranch: () => IBranch | null;
  getCurrentSnapshot: () => ISnapshot | null;
  getSelectedSnapshot: () => ISnapshot | null;
  getPendingRestoreSnapshot: () => ISnapshot | null;
}

const VersionContext = createContext<VersionContextType | null>(null);

interface VersionProviderProps {
  children: ReactNode;
  projectId: string;
  userId: string;
}

export const VersionProvider = ({ children, projectId, userId }: VersionProviderProps) => {
  const [state, setState] = useState<VersionTimelineState>({
    branches: [],
    snapshots: [],
    currentBranchId: '',
    currentSnapshotId: null,
    selectedSnapshotId: null,
    isLoading: false,
    error: null,
  });

  // Track snapshot to restore when canvas becomes available
  const [pendingRestoreSnapshotId, setPendingRestoreSnapshotId] = useState<string | null>(null);

  const canvasRef = useRef<fabric.Canvas | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const initialized = useRef(false);
  const socketListenersAttached = useRef(false);

  // Setters for canvas, layers, and socket
  const setCanvas = useCallback((canvas: fabric.Canvas | null) => {
    console.log('VersionContext: setCanvas called', canvas ? 'with canvas' : 'with null');
    canvasRef.current = canvas;
  }, []);

  const setLayers = useCallback((layers: Layer[]) => {
    console.log('VersionContext: setLayers called with', layers.length, 'layers');
    layersRef.current = layers;
  }, []);

  const setSocket = useCallback((socket: WebSocket | null) => {
    console.log('VersionContext: setSocket called', socket ? `readyState=${socket.readyState}` : 'with null');
    socketRef.current = socket;
  }, []);

  // Helper to check if a snapshot has actual object data
  const hasSnapshotData = (snapshot: ISnapshot): boolean => {
    if (!snapshot.layers || snapshot.layers.length === 0) return false;
    return snapshot.layers.some(layer => {
      if (!layer.objects || layer.objects.length <= 2) return false; // "[]" is length 2
      try {
        const objects = JSON.parse(layer.objects);
        return Array.isArray(objects) && objects.length > 0;
      } catch {
        return false;
      }
    });
  };

  // Generate thumbnail from canvas - captures all visible layers
  const generateThumbnail = useCallback((): string => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('generateThumbnail: No canvas available');
      return '';
    }
    
    try {
      const thumbnail = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.7,
        multiplier: 0.25,
      });
      console.log('Thumbnail generated, length:', thumbnail.length);
      return thumbnail;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return '';
    }
  }, []);

  // Serialize current layer state with proper ordering
  const serializeLayers = useCallback((): ILayerSnapshot[] => {
    const canvas = canvasRef.current;
    const layers = layersRef.current;
    
    console.log('serializeLayers called - canvas:', !!canvas, 'layers:', layers.length);
    
    if (!canvas) {
      console.warn('serializeLayers: No canvas available');
      return [];
    }
    
    if (!layers.length) {
      console.warn('serializeLayers: No layers available');
      return [];
    }

    const allObjects = canvas.getObjects();
    console.log('Total canvas objects:', allObjects.length);

    return layers.map((layer, index) => {
      // Get objects for this layer - check both layerId and 'base' as default
      const layerObjects = allObjects.filter(obj => {
        // If object has no layerId, assign it to the first/base layer
        if (!obj.layerId && index === 0) return true;
        return obj.layerId === layer.id;
      });
      
      console.log(`Layer "${layer.name}" (${layer.id}): ${layerObjects.length} objects`);
      
      const serializedObjects = layerObjects.map(obj => obj.toJSON(['layerId', 'id', 'baseOpacity']));

      return {
        layerId: layer.id,
        name: layer.name,
        type: layer.type,
        objects: JSON.stringify(serializedObjects),
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode || 'normal',
        // Higher index in array = lower in UI = lower zIndex
        // First layer (index 0) = top of UI = highest zIndex
        zIndex: layers.length - 1 - index,
      };
    });
  }, []);

  // Send message via WebSocket
  const sendSocketMessage = useCallback((type: string, payload: any) => {
    const socket = socketRef.current;
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
  }, [userId, projectId]);

  // Handle incoming WebSocket messages
  const handleSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'version:sync': {
          const mergedSnapshots = mergeSnapshots(data.payload.snapshots || [], state.snapshots);
          console.log('Received version sync:', {
            branchesCount: data.payload.branches?.length,
            snapshotsCount: mergedSnapshots?.length,
            snapshots: mergedSnapshots?.map((s: any) => ({
              name: s.name,
              id: s.id?.substring(0, 8),
              layersCount: s.layers?.length,
              layerObjectsLengths: s.layers?.map((l: any) => l.objects?.length || 0),
              thumbnailLength: s.thumbnail?.length || 0,
            })),
          });
          setState(prev => ({
            ...prev,
            branches: data.payload.branches || [],
            snapshots: mergedSnapshots,
            currentBranchId: data.payload.currentBranchId || prev.currentBranchId,
            currentSnapshotId: prev.currentSnapshotId || mergedSnapshots.at(-1)?.id || null,
            isLoading: false,
          }));
          break;
        }

        case 'version:snapshot:created':
          console.log('Snapshot created:', data.payload);
          setState(prev => {
            // Check if this is an update to existing "Current" snapshot
            const existingCurrentIndex = prev.snapshots.findIndex(
              s => s.name === 'Current' && s.branchId === data.payload.branchId
            );
            
            let newSnapshots;
            if (data.payload.name === 'Current' && existingCurrentIndex >= 0) {
              // Replace existing Current snapshot
              newSnapshots = [...prev.snapshots];
              newSnapshots[existingCurrentIndex] = data.payload;
            } else if (prev.snapshots.some(s => s.id === data.payload.id)) {
              // Avoid duplicates
              return prev;
            } else {
              newSnapshots = [...prev.snapshots, data.payload];
            }
            
            // Update branch head
            const updatedBranches = prev.branches.map(branch =>
              branch.id === data.payload.branchId
                ? { ...branch, headSnapshotId: data.payload.id }
                : branch
            );
            
            return {
              ...prev,
              snapshots: newSnapshots,
              branches: updatedBranches,
              currentSnapshotId: data.payload.id,
              isLoading: false,
            };
          });
          break;

        case 'version:snapshot:restored':
          console.log('Snapshot restored:', data.payload);
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

        case 'version:error':
          console.error('Version control error:', data.payload);
          setState(prev => ({
            ...prev,
            error: data.payload.message,
            isLoading: false,
          }));
          break;

        default:
          break;
      }
    } catch (error) {
      // Ignore non-JSON messages
    }
  }, []);

  // Attach WebSocket listeners
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || socketListenersAttached.current) return;
    
    socket.addEventListener('message', handleSocketMessage);
    socketListenersAttached.current = true;

    if (socket.readyState === WebSocket.OPEN) {
      sendSocketMessage('version:sync:request', {});
    } else {
      const onOpen = () => sendSocketMessage('version:sync:request', {});
      socket.addEventListener('open', onOpen, { once: true });
    }

    return () => {
      socket.removeEventListener('message', handleSocketMessage);
      socketListenersAttached.current = false;
    };
  }, [socketRef.current, handleSocketMessage, sendSocketMessage]);

  // Fetch initial data via REST API (fallback)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (socketRef.current) return;

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
  }, [projectId, userId]);

  // Create a new snapshot
  const createSnapshot = useCallback((name: string, description?: string): ISnapshot | null => {
    const currentBranch = state.branches.find(b => b.id === state.currentBranchId);
    if (!currentBranch) {
      setState(prev => ({ ...prev, error: 'No active branch' }));
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      let snapshotLayers: ILayerSnapshot[] = [];
      let snapshotThumbnail: string = '';
      let sourceSnapshotId: string | undefined;

      // Check if canvas exists AND has actual objects
      // If canvas is empty (e.g., on Timeline page), we should copy from existing snapshot
      const canvasHasObjects = canvasRef.current && canvasRef.current.getObjects().length > 0;

      if (canvasHasObjects) {
        snapshotLayers = serializeLayers();
        snapshotThumbnail = generateThumbnail();
        sourceSnapshotId = state.currentSnapshotId || currentBranch.headSnapshotId || undefined;
        console.log('Creating snapshot from canvas - layers:', snapshotLayers.length, 'thumbnail length:', snapshotThumbnail.length);
      } else {
        // If no canvas (e.g., on Timeline page), copy from current/head snapshot
        console.log('No canvas, looking for snapshot to copy from:', {
          currentSnapshotId: state.currentSnapshotId,
          headSnapshotId: currentBranch.headSnapshotId,
          totalSnapshots: state.snapshots.length,
          allSnapshotNames: state.snapshots.map(s => s.name),
        });
        
        // Find the best snapshot to copy from - prefer one with actual data
        let sourceSnapshot = state.snapshots.find(s => s.id === state.currentSnapshotId);
        
        // If current snapshot doesn't have data, try head snapshot
        if (!sourceSnapshot || !hasSnapshotData(sourceSnapshot)) {
          sourceSnapshot = state.snapshots.find(s => s.id === currentBranch.headSnapshotId);
        }
        
        // If still no data, find ANY snapshot on this branch with data (prefer "Current")
        if (!sourceSnapshot || !hasSnapshotData(sourceSnapshot)) {
          const branchSnapshots = state.snapshots
            .filter(s => s.branchId === currentBranch.id)
            .sort((a, b) => b.createdAt - a.createdAt); // Most recent first
          
          // Prefer "Current" snapshot
          sourceSnapshot = branchSnapshots.find(s => s.name === 'Current' && hasSnapshotData(s))
            || branchSnapshots.find(s => hasSnapshotData(s));
        }
        
        if (sourceSnapshot && hasSnapshotData(sourceSnapshot)) {
          // Deep copy the layers to avoid reference issues
          snapshotLayers = sourceSnapshot.layers.map(l => ({ ...l }));
          snapshotThumbnail = sourceSnapshot.thumbnail;
          sourceSnapshotId = sourceSnapshot.id;
          
          // Log detailed layer info
          console.log('Copying from snapshot:', sourceSnapshot.name, {
            sourceSnapshotId,
            layersCount: snapshotLayers.length,
            thumbnailLength: snapshotThumbnail?.length || 0,
            layers: snapshotLayers.map(l => ({
              name: l.name,
              objectsLength: l.objects?.length || 0,
              objectsPreview: l.objects?.substring(0, 100),
            })),
          });
        } else {
          console.warn('No canvas and no snapshot with data to copy from');
          console.log('Available snapshots:', state.snapshots.map(s => ({
            name: s.name,
            id: s.id.substring(0, 8),
            hasData: hasSnapshotData(s),
            layerObjectsLengths: s.layers?.map(l => l.objects?.length || 0),
          })));
        }
      }

      const sent = sendSocketMessage('version:snapshot:create', {
        name,
        description,
        layers: snapshotLayers,
        thumbnail: snapshotThumbnail,
        branchId: state.currentBranchId,
        sourceSnapshotId,
      });

      if (!sent) {
        // Local fallback
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

        setState(prev => {
          // Check if updating existing "Current"
          const existingCurrentIndex = prev.snapshots.findIndex(
            s => s.name === 'Current' && s.branchId === state.currentBranchId
          );
          
          let newSnapshots;
          if (name === 'Current' && existingCurrentIndex >= 0) {
            newSnapshots = [...prev.snapshots];
            newSnapshots[existingCurrentIndex] = snapshot;
          } else {
            newSnapshots = [...prev.snapshots, snapshot];
          }

          const updatedBranches = prev.branches.map(branch =>
            branch.id === state.currentBranchId
              ? { ...branch, headSnapshotId: snapshot.id }
              : branch
          );

          return {
            ...prev,
            snapshots: newSnapshots,
            branches: updatedBranches,
            currentSnapshotId: snapshot.id,
            isLoading: false,
            error: null,
          };
        });

        return snapshot;
      }

      console.log('Snapshot creation request sent:', name);
      return null;
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to create snapshot',
      }));
      return null;
    }
  }, [state.branches, state.currentBranchId, state.snapshots, state.currentSnapshotId, projectId, userId, serializeLayers, generateThumbnail, sendSocketMessage]);

  // Update or create "Current" snapshot (for auto-save)
  const updateCurrentSnapshot = useCallback(() => {
    createSnapshot('Current', 'Auto-saved current canvas state');
  }, [createSnapshot]);

  // Restore a snapshot to canvas
  const restoreSnapshot = useCallback((snapshotId: string): boolean => {
    const canvas = canvasRef.current;
    
    const snapshot = state.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      setState(prev => ({ ...prev, error: 'Snapshot not found' }));
      return false;
    }

    // If canvas not available, queue the restore for when it becomes available
    if (!canvas) {
      console.log('Canvas not ready, queuing snapshot restore:', snapshot.name);
      setPendingRestoreSnapshotId(snapshotId);
      setState(prev => ({
        ...prev,
        currentSnapshotId: snapshotId,
        currentBranchId: snapshot.branchId,
      }));
      return true; // Return true since we queued it
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Clear current canvas
      canvas.clear();
      canvas.backgroundColor = 'white';

      // Sort layers by zIndex to restore in correct order
      const sortedLayers = [...snapshot.layers].sort((a, b) => a.zIndex - b.zIndex);

      // Restore each layer's objects
      sortedLayers.forEach(layerSnapshot => {
        try {
          const objects = JSON.parse(layerSnapshot.objects || '[]');
          
          objects.forEach((objData: any) => {
            fabric.util.enlivenObjects([objData]).then((enlivenedObjects) => {
              enlivenedObjects.forEach((obj: fabric.FabricObject) => {
                obj.layerId = layerSnapshot.layerId;
                if (!layerSnapshot.visible) {
                  obj.visible = false;
                }
                obj.opacity = (obj.opacity || 1) * layerSnapshot.opacity;
                canvas.add(obj);
              });
              canvas.requestRenderAll();
            });
          });
        } catch (e) {
          console.error('Error restoring layer:', layerSnapshot.name, e);
        }
      });

      setState(prev => ({
        ...prev,
        currentSnapshotId: snapshotId,
        currentBranchId: snapshot.branchId,
        isLoading: false,
        error: null,
      }));

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
  }, [state.snapshots, sendSocketMessage]);

  // Create a new branch
  const createBranch = useCallback((name: string, fromSnapshotId?: string, color?: string): IBranch | null => {
    if (state.branches.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      setState(prev => ({ ...prev, error: 'Branch name already exists' }));
      return null;
    }

    const colorIndex = state.branches.length % BRANCH_COLORS.length;
    const baseSnapshotId = fromSnapshotId || state.currentSnapshotId || '';
    const branchColor = color || BRANCH_COLORS[colorIndex];

    const sent = sendSocketMessage('version:branch:create', {
      name,
      fromSnapshotId: baseSnapshotId,
      color: branchColor,
    });

    if (!sent) {
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

      return newBranch;
    }

    return null;
  }, [state.branches, state.currentSnapshotId, projectId, userId, sendSocketMessage]);

  // Switch branch
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

    if (branch.headSnapshotId) {
      restoreSnapshot(branch.headSnapshotId);
    }

    sendSocketMessage('version:branch:switch', { branchId });
    return true;
  }, [state.branches, restoreSnapshot, sendSocketMessage]);

  // Delete branch
  const deleteBranch = useCallback((branchId: string): boolean => {
    const branch = state.branches.find(b => b.id === branchId);
    if (!branch) return false;
    if (branch.name === 'main') {
      setState(prev => ({ ...prev, error: 'Cannot delete main branch' }));
      return false;
    }
    if (branchId === state.currentBranchId) {
      setState(prev => ({ ...prev, error: 'Cannot delete current branch' }));
      return false;
    }

    setState(prev => ({
      ...prev,
      branches: prev.branches.filter(b => b.id !== branchId),
      snapshots: prev.snapshots.filter(s => s.branchId !== branchId),
      error: null,
    }));

    sendSocketMessage('version:branch:delete', { branchId });
    return true;
  }, [state.branches, state.currentBranchId, sendSocketMessage]);

  // Merge branches
  const mergeBranch = useCallback((sourceBranchId: string, targetBranchId: string): ISnapshot | null => {
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

    sendSocketMessage('version:branch:merge', {
      sourceBranchId,
      targetBranchId,
    });

    return null;
  }, [state.branches, state.snapshots, sendSocketMessage]);

  // Select snapshot for preview
  const selectSnapshot = useCallback((snapshotId: string | null) => {
    setState(prev => ({ ...prev, selectedSnapshotId: snapshotId }));
  }, []);

  // Clear pending restore after it's been processed
  const clearPendingRestore = useCallback(() => {
    setPendingRestoreSnapshotId(null);
  }, []);

  // Getters
  const getBranchTrees = useCallback((): BranchTree[] => {
    return state.branches.map(branch => {
      const branchSnapshots = state.snapshots
        .filter(s => s.branchId === branch.id)
        .sort((a, b) => a.createdAt - b.createdAt);
      const headSnapshot = branchSnapshots.find(s => s.id === branch.headSnapshotId) || null;
      return { branch, snapshots: branchSnapshots, headSnapshot };
    });
  }, [state.branches, state.snapshots]);

  const getCurrentBranch = useCallback((): IBranch | null => {
    return state.branches.find(b => b.id === state.currentBranchId) || null;
  }, [state.branches, state.currentBranchId]);

  const getCurrentSnapshot = useCallback((): ISnapshot | null => {
    return state.snapshots.find(s => s.id === state.currentSnapshotId) || null;
  }, [state.snapshots, state.currentSnapshotId]);

  const getSelectedSnapshot = useCallback((): ISnapshot | null => {
    return state.snapshots.find(s => s.id === state.selectedSnapshotId) || null;
  }, [state.snapshots, state.selectedSnapshotId]);

  const getPendingRestoreSnapshot = useCallback((): ISnapshot | null => {
    if (!pendingRestoreSnapshotId) return null;
    return state.snapshots.find(s => s.id === pendingRestoreSnapshotId) || null;
  }, [state.snapshots, pendingRestoreSnapshotId]);

  const value: VersionContextType = {
    branches: state.branches,
    snapshots: state.snapshots,
    currentBranchId: state.currentBranchId,
    currentSnapshotId: state.currentSnapshotId,
    selectedSnapshotId: state.selectedSnapshotId,
    pendingRestoreSnapshotId,
    isLoading: state.isLoading,
    error: state.error,
    createSnapshot,
    updateCurrentSnapshot,
    restoreSnapshot,
    createBranch,
    switchBranch,
    deleteBranch,
    mergeBranch,
    selectSnapshot,
    clearPendingRestore,
    setCanvas,
    setLayers,
    setSocket,
    getBranchTrees,
    getCurrentBranch,
    getCurrentSnapshot,
    getSelectedSnapshot,
    getPendingRestoreSnapshot,
  };

  return (
    <VersionContext.Provider value={value}>
      {children}
    </VersionContext.Provider>
  );
};

export const useVersionContext = () => {
  const context = useContext(VersionContext);
  if (!context) {
    throw new Error('useVersionContext must be used within a VersionProvider');
  }
  return context;
};

export default VersionContext;
