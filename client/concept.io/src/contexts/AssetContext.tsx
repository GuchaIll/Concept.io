import { createContext, useContext, type ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { 
  IAsset, 
  AssetVaultState,
  AssetTag,
} from '../types/asset.interface';
import { TAG_COLORS } from '../types/asset.interface';

interface AssetContextType {
  // State
  assets: IAsset[];
  selectedAssetId: string | null;
  selectedTags: string[];
  searchQuery: string;
  filterCategory: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createAsset: (
    name: string,
    imageData: string,
    tags?: string[],
    category?: string,
    width?: number,
    height?: number,
    sourceLayerId?: string
  ) => IAsset | null;
  updateAsset: (assetId: string, updates: Partial<IAsset>) => void;
  deleteAsset: (assetId: string) => void;
  selectAsset: (assetId: string | null) => void;
  useAsset: (assetId: string) => IAsset | null;
  
  // Tag management
  addTagToAsset: (assetId: string, tag: string) => void;
  removeTagFromAsset: (assetId: string, tag: string) => void;
  setSelectedTags: (tags: string[]) => void;
  getAllTags: () => AssetTag[];
  
  // Filtering & Search
  setSearchQuery: (query: string) => void;
  setFilterCategory: (category: string | null) => void;
  getFilteredAssets: () => IAsset[];
  
  // WebSocket connection
  setSocket: (socket: WebSocket | null) => void;
  
  // Layer integration
  saveLayerAsAsset: (
    layerId: string,
    layerName: string,
    imageData: string,
    width: number,
    height: number,
    tags?: string[]
  ) => IAsset | null;
}

const AssetContext = createContext<AssetContextType | null>(null);

interface AssetProviderProps {
  children: ReactNode;
  projectId: string;
  userId: string;
}

export const AssetProvider = ({ children, projectId, userId }: AssetProviderProps) => {
  const [state, setState] = useState<AssetVaultState>({
    assets: [],
    selectedAssetId: null,
    selectedTags: [],
    searchQuery: '',
    filterCategory: null,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    isLoading: false,
    error: null,
  });

  const socketRef = useRef<WebSocket | null>(null);
  const socketListenersAttached = useRef(false);
  const [socketVersion, setSocketVersion] = useState(0); // Track socket changes

  const setSocket = useCallback((socket: WebSocket | null) => {
    console.log('AssetContext: setSocket called', socket ? `readyState=${socket.readyState}` : 'with null');
    socketRef.current = socket;
    socketListenersAttached.current = false; // Reset so listeners can be re-attached
    setSocketVersion(v => v + 1); // Trigger useEffect
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
      
      // Only log asset-related messages
      if (data.type?.startsWith('asset:')) {
        console.log('AssetContext received message:', data.type, data.payload);
      }
      
      switch (data.type) {
        case 'asset:sync': {
          console.log('AssetContext: Received asset sync:', {
            assetsCount: data.payload.assets?.length,
            assets: data.payload.assets?.map((a: any) => ({ id: a.id, name: a.name })),
          });
          setState(prev => ({
            ...prev,
            assets: data.payload.assets || [],
            isLoading: false,
          }));
          break;
        }

        case 'asset:created':
          console.log('AssetContext: Asset created:', data.payload.name, data.payload.id);
          setState(prev => {
            if (prev.assets.some(a => a.id === data.payload.id)) {
              console.log('AssetContext: Asset already exists, skipping');
              return prev; // Avoid duplicates
            }
            console.log('AssetContext: Adding new asset to state');
            return {
              ...prev,
              assets: [...prev.assets, data.payload],
              isLoading: false,
            };
          });
          break;

        case 'asset:updated':
          console.log('Asset updated:', data.payload.name);
          setState(prev => ({
            ...prev,
            assets: prev.assets.map(a => 
              a.id === data.payload.id ? data.payload : a
            ),
          }));
          break;

        case 'asset:deleted':
          console.log('Asset deleted:', data.payload.assetId);
          setState(prev => ({
            ...prev,
            assets: prev.assets.filter(a => a.id !== data.payload.assetId),
            selectedAssetId: prev.selectedAssetId === data.payload.assetId 
              ? null 
              : prev.selectedAssetId,
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
    
    console.log('AssetContext: Attaching WebSocket listeners');
    socket.addEventListener('message', handleSocketMessage);
    socketListenersAttached.current = true;

    // Request asset sync when connected
    if (socket.readyState === WebSocket.OPEN) {
      console.log('AssetContext: Socket is open, requesting asset sync');
      sendSocketMessage('asset:sync:request', {});
    } else {
      console.log('AssetContext: Socket not open yet, waiting for open event');
      const onOpen = () => {
        console.log('AssetContext: Socket opened, requesting asset sync');
        sendSocketMessage('asset:sync:request', {});
      };
      socket.addEventListener('open', onOpen, { once: true });
    }

    return () => {
      socket.removeEventListener('message', handleSocketMessage);
      socketListenersAttached.current = false;
    };
  }, [socketVersion, handleSocketMessage, sendSocketMessage]);

  // Create a new asset
  const createAsset = useCallback((
    name: string,
    imageData: string,
    tags: string[] = [],
    category?: string,
    width: number = 100,
    height: number = 100,
    sourceLayerId?: string
  ): IAsset | null => {
    setState(prev => ({ ...prev, isLoading: true }));

    // Generate thumbnail (smaller version)
    const thumbnailData = imageData; // TODO: Generate actual thumbnail

    const assetPayload = {
      id: uuidv4(),
      name,
      imageData,
      thumbnailData,
      tags,
      category,
      width,
      height,
      sourceLayerId,
      isShared: false,
    };

    const sent = sendSocketMessage('asset:create', assetPayload);

    if (!sent) {
      // Local fallback
      const asset: IAsset = {
        ...assetPayload,
        projectId,
        description: '',
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        sharedWith: [],
      };

      setState(prev => ({
        ...prev,
        assets: [...prev.assets, asset],
        isLoading: false,
      }));

      return asset;
    }

    // Safety timeout - reset loading state after 5 seconds if no response
    setTimeout(() => {
      setState(prev => {
        if (prev.isLoading) {
          console.warn('Asset creation timeout - resetting loading state');
          return { ...prev, isLoading: false };
        }
        return prev;
      });
    }, 5000);

    return null;
  }, [projectId, userId, sendSocketMessage]);

  // Update an asset
  const updateAsset = useCallback((assetId: string, updates: Partial<IAsset>) => {
    sendSocketMessage('asset:update', { assetId, updates });
    
    // Optimistic update
    setState(prev => ({
      ...prev,
      assets: prev.assets.map(a => 
        a.id === assetId ? { ...a, ...updates, updatedAt: Date.now() } : a
      ),
    }));
  }, [sendSocketMessage]);

  // Delete an asset
  const deleteAsset = useCallback((assetId: string) => {
    sendSocketMessage('asset:delete', { assetId });
    
    // Optimistic update
    setState(prev => ({
      ...prev,
      assets: prev.assets.filter(a => a.id !== assetId),
      selectedAssetId: prev.selectedAssetId === assetId ? null : prev.selectedAssetId,
    }));
  }, [sendSocketMessage]);

  // Select an asset
  const selectAsset = useCallback((assetId: string | null) => {
    setState(prev => ({ ...prev, selectedAssetId: assetId }));
  }, []);

  // Use an asset (for tracking and retrieving)
  const useAsset = useCallback((assetId: string): IAsset | null => {
    const asset = state.assets.find(a => a.id === assetId);
    if (asset) {
      sendSocketMessage('asset:use', { assetId });
      // Optimistic update for usage
      setState(prev => ({
        ...prev,
        assets: prev.assets.map(a => 
          a.id === assetId 
            ? { ...a, usageCount: a.usageCount + 1, lastUsedAt: Date.now() } 
            : a
        ),
      }));
    }
    return asset || null;
  }, [state.assets, sendSocketMessage]);

  // Tag management
  const addTagToAsset = useCallback((assetId: string, tag: string) => {
    const asset = state.assets.find(a => a.id === assetId);
    if (asset && !asset.tags.includes(tag)) {
      updateAsset(assetId, { tags: [...asset.tags, tag] });
    }
  }, [state.assets, updateAsset]);

  const removeTagFromAsset = useCallback((assetId: string, tag: string) => {
    const asset = state.assets.find(a => a.id === assetId);
    if (asset) {
      updateAsset(assetId, { tags: asset.tags.filter(t => t !== tag) });
    }
  }, [state.assets, updateAsset]);

  const setSelectedTags = useCallback((tags: string[]) => {
    setState(prev => ({ ...prev, selectedTags: tags }));
  }, []);

  const getAllTags = useCallback((): AssetTag[] => {
    const tagCounts = new Map<string, number>();
    
    state.assets.forEach(asset => {
      asset.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([name, count], index) => ({
        name,
        color: TAG_COLORS[index % TAG_COLORS.length],
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [state.assets]);

  // Filtering & Search
  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setFilterCategory = useCallback((category: string | null) => {
    setState(prev => ({ ...prev, filterCategory: category }));
  }, []);

  const getFilteredAssets = useCallback((): IAsset[] => {
    let filtered = [...state.assets];

    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query) ||
        a.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (state.filterCategory) {
      filtered = filtered.filter(a => a.category === state.filterCategory);
    }

    // Filter by selected tags
    if (state.selectedTags.length > 0) {
      filtered = filtered.filter(a => 
        state.selectedTags.some(tag => a.tags.includes(tag))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (state.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'usageCount':
          comparison = a.usageCount - b.usageCount;
          break;
        case 'lastUsedAt':
          comparison = (a.lastUsedAt || 0) - (b.lastUsedAt || 0);
          break;
      }
      return state.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [state.assets, state.searchQuery, state.filterCategory, state.selectedTags, state.sortBy, state.sortOrder]);

  // Save layer as asset
  const saveLayerAsAsset = useCallback((
    layerId: string,
    layerName: string,
    imageData: string,
    width: number,
    height: number,
    tags: string[] = []
  ): IAsset | null => {
    return createAsset(
      layerName,
      imageData,
      tags,
      undefined,
      width,
      height,
      layerId
    );
  }, [createAsset]);

  const value: AssetContextType = {
    assets: state.assets,
    selectedAssetId: state.selectedAssetId,
    selectedTags: state.selectedTags,
    searchQuery: state.searchQuery,
    filterCategory: state.filterCategory,
    isLoading: state.isLoading,
    error: state.error,
    createAsset,
    updateAsset,
    deleteAsset,
    selectAsset,
    useAsset,
    addTagToAsset,
    removeTagFromAsset,
    setSelectedTags,
    getAllTags,
    setSearchQuery,
    setFilterCategory,
    getFilteredAssets,
    setSocket,
    saveLayerAsAsset,
  };

  return (
    <AssetContext.Provider value={value}>
      {children}
    </AssetContext.Provider>
  );
};

export const useAssetContext = () => {
  const context = useContext(AssetContext);
  if (!context) {
    throw new Error('useAssetContext must be used within an AssetProvider');
  }
  return context;
};

// Re-export types for convenience
export type { IAsset, AssetTag };
export { ASSET_CATEGORIES, TAG_COLORS } from '../types/asset.interface';

export default AssetContext;
