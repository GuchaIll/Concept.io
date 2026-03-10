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
  restoreSnapshot: (snapshotId: string) => Promise<boolean>;
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
  // Store the full snapshot data for pending restore (in case state gets cleared during navigation)
  const pendingRestoreSnapshotRef = useRef<ISnapshot | null>(null);

  const canvasRef = useRef<fabric.Canvas | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotsRef = useRef<ISnapshot[]>([]); // Keep a ref to avoid stale closures
  const initialized = useRef(false);
  const socketListenersAttached = useRef(false);
  // Generation counter for direct canvas restores (branch switch etc.).
  // Incremented before each restore so in-flight async operations can detect supersession.
  const restoreGenRef = useRef(0);

  // Keep snapshots ref in sync with state
  useEffect(() => {
    snapshotsRef.current = state.snapshots;
  }, [state.snapshots]);

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
  // Supports delta mode: only dirty layers get full serialization, clean layers emit references
  const serializeLayers = useCallback((deltaMode: boolean = false, _currentSnapshotIdForRef?: string | null): ILayerSnapshot[] => {
    const canvas = canvasRef.current;
    const layers = layersRef.current;
    
    console.log('serializeLayers called - canvas:', !!canvas, 'layers:', layers.length, 'deltaMode:', deltaMode);
    
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
      // Delta mode: if layer is clean and has a previous snapshot reference, emit a reference
      if (deltaMode && !layer.isDirty && layer.lastSnapshotId) {
        console.log(`Layer "${layer.name}" is clean — emitting reference to snapshot ${layer.lastSnapshotId}`);
        return {
          layerId: layer.id,
          name: layer.name,
          type: layer.type,
          objects: '[]',  // Empty — data lives in the referenced snapshot
          visible: layer.visible,
          opacity: layer.opacity,
          blendMode: layer.blendMode || 'normal',
          locked: layer.locked ?? false,
          zIndex: layers.length - 1 - index,
          snapshotType: 'reference' as const,
          referenceSnapshotId: layer.lastSnapshotId,
        };
      }

      // Full serialization for dirty layers or non-delta mode
      // Get objects for this layer - check both layerId and 'base' as default
      const layerObjects = allObjects.filter(obj => {
        // If object has no layerId, assign it to the first/base layer
        if (!obj.layerId && index === 0) return true;
        return obj.layerId === layer.id;
      });
      
      console.log(`Layer "${layer.name}" (${layer.id}): ${layerObjects.length} objects (full serialization)`);
      
      const serializedObjects = layerObjects.map(obj => {
        const json = obj.toJSON();
        // Manually add custom properties
        return {
          ...json,
          layerId: obj.layerId,
          id: (obj as any).id,
          baseOpacity: obj.baseOpacity,
        };
      });

      return {
        layerId: layer.id,
        name: layer.name,
        type: layer.type,
        objects: JSON.stringify(serializedObjects),
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode || 'normal',
        locked: layer.locked ?? false,
        // Higher index in array = lower in UI = lower zIndex
        // First layer (index 0) = top of UI = highest zIndex
        zIndex: layers.length - 1 - index,
        snapshotType: 'full' as const,
      };
    });
  }, []);

  // Helper function to merge server snapshots with local snapshots
  // Prefers snapshots with actual layer data over empty ones
  const mergeSnapshots = (serverSnapshots: ISnapshot[], localSnapshots: ISnapshot[]): ISnapshot[] => {
    const mergedMap = new Map<string, ISnapshot>();
    
    // Add all local snapshots first
    localSnapshots.forEach(snapshot => {
      mergedMap.set(snapshot.id, snapshot);
    });
    
    // Merge server snapshots - prefer ones with more data
    serverSnapshots.forEach(serverSnapshot => {
      const existing = mergedMap.get(serverSnapshot.id);
      
      if (!existing) {
        // New snapshot from server
        mergedMap.set(serverSnapshot.id, serverSnapshot);
      } else {
        // Compare which has more data
        const existingHasData = hasSnapshotData(existing);
        const serverHasData = hasSnapshotData(serverSnapshot);
        
        // Prefer the one with actual data, or server if both have data (more recent)
        if (serverHasData && (!existingHasData || serverSnapshot.createdAt > existing.createdAt)) {
          mergedMap.set(serverSnapshot.id, serverSnapshot);
        }
      }
    });
    
    // Sort by creation time
    return Array.from(mergedMap.values()).sort((a, b) => a.createdAt - b.createdAt);
  };

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
          // Use ref to get latest local snapshots to avoid stale closure
          const mergedSnapshots = mergeSnapshots(data.payload.snapshots || [], snapshotsRef.current);
          console.log('Received version sync:', {
            branchesCount: data.payload.branches?.length,
            snapshotsCount: mergedSnapshots?.length,
            localSnapshotsCount: snapshotsRef.current.length,
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
          console.log('Snapshot created broadcast:', data.payload?.name, data.payload?.id?.substring(0, 8));
          setState(prev => {
            // Check if we already have this exact snapshot locally (by ID).
            // Since we now save optimistically before the WS round-trip, the originating client
            // will already have the snapshot. Prefer local data over server version to avoid
            // overwriting a good local snapshot (with full image objects) with a potentially
            // stripped server version (if a large WS message was partially saved).
            const existingById = prev.snapshots.find(s => s.id === data.payload.id);
            if (existingById) {
              // Already have this snapshot — only accept server version if it has MORE data
              // (e.g., from a collaborator's snapshot that we don't have locally).
              if (hasSnapshotData(data.payload) && !hasSnapshotData(existingById)) {
                const newSnapshots = prev.snapshots.map(s =>
                  s.id === data.payload.id ? data.payload : s
                );
                return { ...prev, snapshots: newSnapshots };
              }
              return prev; // Keep our local (optimistic) version
            }

            // New snapshot from a collaborator — add it
            let newSnapshots;
            if (data.payload.name === 'Current') {
              // Replace existing "Current" on the same branch (collaborator update)
              const existingCurrentIndex = prev.snapshots.findIndex(
                s => s.name === 'Current' && s.branchId === data.payload.branchId
              );
              if (existingCurrentIndex >= 0) {
                newSnapshots = [...prev.snapshots];
                newSnapshots[existingCurrentIndex] = data.payload;
              } else {
                newSnapshots = [...prev.snapshots, data.payload];
              }
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
        // Use delta mode: only serialize dirty layers fully, reference clean layers
        const useDeltaMode = name !== 'Current' && !!state.currentSnapshotId;
        snapshotLayers = serializeLayers(useDeltaMode, state.currentSnapshotId);
        snapshotThumbnail = generateThumbnail();
        sourceSnapshotId = state.currentSnapshotId || currentBranch.headSnapshotId || undefined;
        const deltaCount = snapshotLayers.filter(l => l.snapshotType === 'reference').length;
        const fullCount = snapshotLayers.filter(l => l.snapshotType === 'full').length;
        console.log(`Creating snapshot from canvas - layers: ${snapshotLayers.length} (${fullCount} full, ${deltaCount} reference), thumbnail length: ${snapshotThumbnail.length}`);
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

      // Always save locally first (optimistic update) — do NOT rely solely on WS broadcast.
      // If the WS message is too large (e.g., asset layer with a full image data URL) the server
      // may fail silently and never broadcast back, which would wipe the snapshot from local state.
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

      // Also sync to server via WebSocket (best-effort for persistence & collaborator broadcast).
      // Pass our locally-generated ID so the server uses the same ID — this lets the
      // version:snapshot:created broadcast be de-duplicated on receipt.
      sendSocketMessage('version:snapshot:create', {
        id: snapshot.id,
        name,
        description,
        layers: snapshotLayers,
        thumbnail: snapshotThumbnail,
        branchId: state.currentBranchId,
        sourceSnapshotId,
      });

      console.log('Snapshot saved locally and sync request sent:', name, snapshot.id.substring(0, 8));
      return snapshot;
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

  // Resolve a snapshot's reference layers — fetches full data from server if needed
  const resolveSnapshotLayers = useCallback(async (snapshot: ISnapshot): Promise<ILayerSnapshot[]> => {
    const hasReferences = snapshot.layers.some(l => l.snapshotType === 'reference');
    if (!hasReferences) return snapshot.layers;

    // Try server-side resolution first
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${snapshot.projectId}/snapshots/${snapshot.id}/resolved`
      );
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.layers) {
          console.log('Resolved delta snapshot from server:', snapshot.name);
          return result.data.layers;
        }
      }
    } catch (e) {
      console.warn('Server-side delta resolution failed, trying client-side:', e);
    }

    // Client-side fallback: walk snapshotsRef to resolve references
    const resolvedLayers: ILayerSnapshot[] = [];
    for (const layer of snapshot.layers) {
      if (layer.snapshotType === 'reference' && layer.referenceSnapshotId) {
        const refSnapshot = snapshotsRef.current.find(s => s.id === layer.referenceSnapshotId);
        if (refSnapshot) {
          const refLayer = refSnapshot.layers.find(l => l.layerId === layer.layerId);
          if (refLayer && refLayer.snapshotType !== 'reference') {
            resolvedLayers.push({ ...layer, objects: refLayer.objects, snapshotType: 'full' });
            continue;
          }
        }
        // Could not resolve — use empty
        console.warn(`Could not resolve client-side reference for layer ${layer.layerId}`);
        resolvedLayers.push({ ...layer, snapshotType: 'full' });
      } else {
        resolvedLayers.push(layer);
      }
    }
    return resolvedLayers;
  }, []);

  // Restore a snapshot to canvas
  const restoreSnapshot = useCallback(async (snapshotId: string): Promise<boolean> => {
    const canvas = canvasRef.current;
    // Use ref to get latest snapshots to avoid stale closure
    const currentSnapshots = snapshotsRef.current;
    
    console.log('restoreSnapshot called with:', snapshotId);
    console.log('Available snapshots:', currentSnapshots.map(s => ({ id: s.id, name: s.name })));
    
    const snapshot = currentSnapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      console.error('Snapshot not found:', snapshotId);
      setState(prev => ({ ...prev, error: 'Snapshot not found' }));
      return false;
    }
    
    console.log('Found snapshot:', snapshot.name, 'layers:', snapshot.layers?.length);

    // Check if canvas is available AND valid (has context - not disposed)
    // When navigating away from canvas page, the canvas may still exist in ref but be disposed
    const isCanvasValid = canvas && canvas.getContext && canvas.getContext();
    
    // If canvas not available or not valid, queue the restore for when it becomes available
    if (!isCanvasValid) {
      console.log('Canvas not ready or disposed, queuing snapshot restore:', snapshot.name);
      // Store both the ID and the full snapshot data
      setPendingRestoreSnapshotId(snapshotId);
      pendingRestoreSnapshotRef.current = snapshot; // Store full data in ref
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

      // Resolve delta references before restoring
      const resolvedLayers = snapshot.layers.some(l => l.snapshotType === 'reference')
        ? await resolveSnapshotLayers(snapshot)
        : snapshot.layers;

      // Sort layers by zIndex to restore in correct order
      const sortedLayers = [...resolvedLayers].sort((a, b) => a.zIndex - b.zIndex);

      // Capture generation — abort if a newer restore supersedes this one
      const currentGen = ++restoreGenRef.current;

      // Restore each layer's objects using sequential async/await to maintain order
      for (const layerSnapshot of sortedLayers) {
        if (restoreGenRef.current !== currentGen) {
          console.log('restoreSnapshot (VersionContext): aborted (superseded)');
          return false;
        }
        try {
          const objects = JSON.parse(layerSnapshot.objects || '[]');
          for (const objData of objects) {
            if (restoreGenRef.current !== currentGen) return false;
            const enlivenedObjects = await fabric.util.enlivenObjects([objData]);
            if (restoreGenRef.current !== currentGen) return false;
            (enlivenedObjects as fabric.FabricObject[]).forEach((obj: fabric.FabricObject) => {
              obj.layerId = layerSnapshot.layerId;
              if (!layerSnapshot.visible) {
                obj.visible = false;
              }
              obj.opacity = (obj.opacity || 1) * layerSnapshot.opacity;
              canvas.add(obj);
            });
          }
        } catch (e) {
          console.error('Error restoring layer:', layerSnapshot.name, e);
        }
      }

      if (restoreGenRef.current !== currentGen) return false;

      canvas.requestRenderAll();

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
  }, [sendSocketMessage]);

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
    pendingRestoreSnapshotRef.current = null;
  }, []);

  // Getters
  const getBranchTrees = useCallback((): BranchTree[] => {
    return state.branches.map(branch => {
      const branchSnapshots = snapshotsRef.current
        .filter(s => s.branchId === branch.id)
        .sort((a, b) => a.createdAt - b.createdAt);
      const headSnapshot = branchSnapshots.find(s => s.id === branch.headSnapshotId) || null;
      return { branch, snapshots: branchSnapshots, headSnapshot };
    });
  }, [state.branches]);

  const getCurrentBranch = useCallback((): IBranch | null => {
    return state.branches.find(b => b.id === state.currentBranchId) || null;
  }, [state.branches, state.currentBranchId]);

  const getCurrentSnapshot = useCallback((): ISnapshot | null => {
    return snapshotsRef.current.find(s => s.id === state.currentSnapshotId) || null;
  }, [state.currentSnapshotId]);

  const getSelectedSnapshot = useCallback((): ISnapshot | null => {
    return snapshotsRef.current.find(s => s.id === state.selectedSnapshotId) || null;
  }, [state.selectedSnapshotId]);

  const getPendingRestoreSnapshot = useCallback((): ISnapshot | null => {
    if (!pendingRestoreSnapshotId) return null;
    // First check if we have the full data stored in ref (most reliable)
    if (pendingRestoreSnapshotRef.current && pendingRestoreSnapshotRef.current.id === pendingRestoreSnapshotId) {
      return pendingRestoreSnapshotRef.current;
    }
    // Fallback to looking up in snapshotsRef
    return snapshotsRef.current.find(s => s.id === pendingRestoreSnapshotId) || null;
  }, [pendingRestoreSnapshotId]);

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
