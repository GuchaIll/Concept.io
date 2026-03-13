import { useCanvasContext } from '../contexts/CanvasContext';
import { useVersionContext } from '../contexts/VersionContext';
import { useAssetContext } from '../contexts/AssetContext';
import { useSession } from '../contexts/SessionContext';
import { useTool } from '../contexts/ToolContext';
import Modal from './Modal/SessionInvitationModal';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MousePointer2 } from 'lucide-react';
import {
  WorkspaceLayout,
  CanvasArea,
  TopUtilityBar,
  ToolRail,
  LayersPanel,
  BottomActionBar,
} from './Workspace';
import { AssetVaultPanel } from './Workspace/AssetVaultPanel';
import { SelectionSmartTag } from './Workspace/SelectionSmartTag';
import { GenerationQueuePanel } from './Workspace/GenerationQueuePanel';
import type { LayerType } from '../hooks/Layer';
import { useWebSocket } from '../hooks/useWebSocket';
import { useCutout } from '../hooks/useCutout';
import type { MaskProposal } from '../hooks/useCutout';
import type { CutoutSettings } from '../types/asset.interface';
import { CutoutPanel } from './Workspace/CutoutPanel';
import { EditPanel } from './Workspace/EditPanel';
import type { EditGenerateParams } from './Workspace/EditPanel';
import { LiquifyPanel } from './Workspace/LiquifyPanel';
import { EffectsPanel } from './Workspace/EffectsPanel';
import { ToastContainer } from './Toast';
import { SyncSettings } from './Panel/SyncSettings';
import * as fabric from 'fabric';

export const FCanvas = () => {
  const { canvasRef, canvas, layer, brushProps, zoomLevel, zoomIn, zoomOut, resetZoom, history, selection, toast } = useCanvasContext();
  const { projectId, userId } = useSession();
  const { dispatch: toolDispatch } = useTool();
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [showAssetVault, setShowAssetVault] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showGenerationQueue, setShowGenerationQueue] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationJobs, setGenerationJobs] = useState<Array<{
    id: string;
    prompt: string;
    status: 'pending' | 'loading_model' | 'generating' | 'completed' | 'failed';
    progress: number;
    imageData?: string;
    error?: string;
  }>>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const hasRestoredSnapshot = useRef(false);
  const hasPlacedAsset = useRef(false);
  // Monotonically-increasing counter ΓÇö incremented each time a new canvas restore starts.
  // Any in-flight restoreLayerObjects invocation compares its captured generation against
  // this ref before adding objects; if they differ the restore has been superseded and bails.
  const restoreGenRef = useRef(0);
  
  // Ref to track current layer state for use in async callbacks
  const layerRef = useRef(layer);
  useEffect(() => {
    layerRef.current = layer;
  }, [layer]);

  // Cutout hook ΓÇö proposals + apply for interactive panel; legacy processImage kept for vault uploads
  const { getProposals: getProposalsMask, applyMask: applyMaskCutout } = useCutout();
  
  // Store the asset type for the current generation job (must be defined before pollGenerationStatus)
  const generationAssetTypeRef = useRef<'foreground' | 'background'>('foreground');

  // Pending cutout: holds generated image + SAM proposals while CutoutPanel is open
  const [pendingCutout, setPendingCutout] = useState<{
    imageData: string;
    proposals: MaskProposal[];
    jobId: string;
    bounds?: { left: number; top: number; width: number; height: number };
  } | null>(null);

  // Pending edit: holds source image data while EditPanel is open
  const [pendingEdit, setPendingEdit] = useState<{
    imageData: string;
    width: number;
    height: number;
    objectRef: fabric.FabricObject | null;
  } | null>(null);

  // Pending liquify: holds source image data while LiquifyPanel is open
  const [pendingLiquify, setPendingLiquify] = useState<{
    imageData: string;
    width: number;
    height: number;
    objectRef: fabric.FabricObject | null;
  } | null>(null);

  // Pending effects: holds source image while EffectsPanel is open
  const [pendingEffects, setPendingEffects] = useState<{
    imageData: string;
    width: number;
    height: number;
    objectRef: fabric.FabricObject | null;
  } | null>(null);

  // Connect to WebSocket for real-time version control sync
  const { socket } = useWebSocket({
    projectId,
    userId,
    autoConnect: true,
  });

  // Use shared version context
  const versionContext = useVersionContext();
  
  // Use asset context
  const assetContext = useAssetContext();

  // Connect canvas and layers to version context when they change
  useEffect(() => {
    versionContext.setCanvas(canvas);
    
    // Cleanup: clear canvas ref when component unmounts to prevent using disposed canvas
    return () => {
      versionContext.setCanvas(null);
    };
  }, [canvas, versionContext.setCanvas]);

  // Connect socket to asset context
  useEffect(() => {
    assetContext.setSocket(socket);
  }, [socket, assetContext.setSocket]);

  // Handle asset placement from navigation state (from Asset Vault)
  useEffect(() => {
    if (!canvas || hasPlacedAsset.current) return;
    
    const state = location.state as { placeAsset?: { assetId: string; name: string; imageData: string; width: number; height: number } } | null;
    
    if (state?.placeAsset) {
      console.log('Placing asset from vault:', state.placeAsset.name);
      hasPlacedAsset.current = true;
      
      // Create asset layer
      layer.addAssetLayer(
        state.placeAsset.assetId,
        state.placeAsset.name,
        state.placeAsset.imageData,
        state.placeAsset.width,
        state.placeAsset.height
      ).then(() => {
        // Track asset usage
        assetContext.useAsset(state.placeAsset!.assetId);
        
        // Switch to select tool so user can immediately transform the asset
        toolDispatch({
          type: 'SET_ACTIVE_TOOL',
          payload: {
            id: 'select',
            icon: MousePointer2,
            label: 'Select',
            hasSubmenu: true,
            submenuType: 'select'
          }
        });
        
        // Clear the navigation state to prevent re-placing
        navigate(location.pathname, { replace: true, state: null });
      });
    }
  }, [canvas, location.state, layer, assetContext, navigate, location.pathname, toolDispatch]);

  useEffect(() => {
    versionContext.setLayers(layer.layers);
  }, [layer.layers, versionContext.setLayers]);

  useEffect(() => {
    versionContext.setSocket(socket);
  }, [socket, versionContext.setSocket]);

  // Show toast when folder/git sync completes
  useEffect(() => {
    if (versionContext.syncStatus === 'success') {
      toast.addToast('Snapshot synced successfully', 'success', 1500);
    } else if (versionContext.syncStatus === 'failed') {
      toast.addToast('Sync failed', 'error', 1500);
    }
  }, [versionContext.syncStatus, toast]);

  // Reset restore flag when pending restore changes (allows new restores)
  useEffect(() => {
    if (versionContext.pendingRestoreSnapshotId) {
      console.log('Pending restore detected, resetting hasRestoredSnapshot');
      hasRestoredSnapshot.current = false;
    }
  }, [versionContext.pendingRestoreSnapshotId]);

  // Restore pending snapshot when canvas is ready
  useEffect(() => {
    if (!canvas) {
      console.log('FCanvas restore effect: canvas not ready');
      return;
    }
    
    if (hasRestoredSnapshot.current) {
      console.log('FCanvas restore effect: already restored');
      return;
    }
    
    // Check for pending restore first, then current snapshot
    const pendingSnapshot = versionContext.getPendingRestoreSnapshot();
    const currentSnapshot = versionContext.getCurrentSnapshot();
    const snapshotToRestore = pendingSnapshot || currentSnapshot;
    
    console.log('FCanvas restore effect:', {
      hasPending: !!pendingSnapshot,
      hasCurrent: !!currentSnapshot,
      pendingId: versionContext.pendingRestoreSnapshotId,
      currentId: versionContext.currentSnapshotId,
    });
    
    if (!snapshotToRestore) {
      console.log('No snapshot to restore');
      hasRestoredSnapshot.current = true;
      return;
    }

    // Check if snapshot has actual data (skip reference layers - they have empty objects but data elsewhere)
    const hasObjects = snapshotToRestore.layers.some(l => {
      if (l.snapshotType === 'reference') return true; // References count as having data
      const objects = JSON.parse(l.objects || '[]');
      return objects.length > 0;
    });

    if (!hasObjects) {
      console.log('Snapshot has no objects to restore:', snapshotToRestore.name);
      hasRestoredSnapshot.current = true;
      // Clear pending restore
      if (pendingSnapshot) {
        versionContext.clearPendingRestore();
      }
      return;
    }

    console.log('Restoring canvas from snapshot:', snapshotToRestore.name, 'with', snapshotToRestore.layers.length, 'layers');
    hasRestoredSnapshot.current = true;

    // Clear canvas first
    canvas.clear();
    canvas.backgroundColor = 'white';

    // Sort layers by zIndex (ascending) - lower zIndex = bottom = added first
    const sortedLayers = [...snapshotToRestore.layers].sort((a, b) => a.zIndex - b.zIndex);

    // Restore layer state (this updates the layers panel)
    layer.restoreLayersFromSnapshot(snapshotToRestore.layers);

    // Restore each layer's objects in order (lowest zIndex first so they appear at bottom)
    let totalObjects = 0;

    // Capture the current generation ΓÇö if a newer restore starts while this is still running
    // (e.g. the user clicks another snapshot) we abort to prevent stale objects being added.
    const currentGen = ++restoreGenRef.current;

    // Use a sequential approach to maintain layer order
    const restoreLayerObjects = async () => {
      // Add objects from lowest zIndex to highest (bottom to top)
      for (const layerSnapshot of sortedLayers) {
        // Abort if superseded by a newer restore
        if (restoreGenRef.current !== currentGen) {
          console.log('restoreLayerObjects: aborted (superseded by generation', restoreGenRef.current, ')');
          return;
        }

        try {
          const objects = JSON.parse(layerSnapshot.objects || '[]');
          console.log(`Restoring layer "${layerSnapshot.name}" (zIndex: ${layerSnapshot.zIndex}): ${objects.length} objects`);
          if (objects.length === 0) continue;

          totalObjects += objects.length;

          // Enliven and add objects for this layer
          for (const objData of objects) {
            // Abort mid-layer if superseded (image loads can be slow for asset layers)
            if (restoreGenRef.current !== currentGen) {
              console.log('restoreLayerObjects: aborted mid-layer (superseded)');
              return;
            }
            try {
              const enlivenedObjects = await fabric.util.enlivenObjects([objData]);
              // Final supersession check after the async image load completes
              if (restoreGenRef.current !== currentGen) {
                console.log('restoreLayerObjects: aborted after enlivenObjects (superseded)');
                return;
              }
              (enlivenedObjects as fabric.FabricObject[]).forEach((obj: fabric.FabricObject) => {
                obj.layerId = layerSnapshot.layerId;
                if (!layerSnapshot.visible) {
                  obj.visible = false;
                }
                // Apply layer opacity
                if (obj.baseOpacity === undefined) {
                  obj.baseOpacity = obj.opacity;
                }
                obj.opacity = (obj.baseOpacity || 1) * layerSnapshot.opacity;
                // Mark as restored to skip history saving
                (obj as any)._skipHistory = true;
                canvas.add(obj);
              });
            } catch (err) {
              console.error('Failed to enliven object:', err);
            }
          }
        } catch (e) {
          console.error('Error restoring layer:', layerSnapshot.name, e);
        }
      }

      if (restoreGenRef.current === currentGen) {
        canvas.requestRenderAll();
        console.log('Canvas restoration complete:', snapshotToRestore.name, 'total objects:', totalObjects);
      }
    };
    
    restoreLayerObjects();

    // Clear pending restore after processing
    if (pendingSnapshot) {
      versionContext.clearPendingRestore();
    }

    canvas.requestRenderAll();
    console.log('Canvas restoration initiated for', snapshotToRestore.name, 'total objects:', totalObjects);
  }, [canvas, versionContext]);

  // Collaborators for header avatars only
  const collaborators = [
    { id: '1', name: 'Alex K.', avatarUrl: '/avatars/cat.png' },
    { id: '2', name: 'Sarah M.', avatarUrl: '/avatars/panda.png' },
  ];

  const handleUndo = () => {
    history.undo();
    console.log('Undo');
  };

  const handleRedo = () => {
    history.redo();
    console.log('Redo');
  };

  const handleDiffusionPrompt = () => {
    // Toggle generation queue panel
    setShowGenerationQueue(!showGenerationQueue);
    console.log('Toggle generation queue panel');
  };

  const handleLayerTypeChange = (layerId: string, type: LayerType) => {
    layer.updateLayerType(layerId, type);
  };

  const handleReorderLayers = (oldIndex: number, newIndex: number) => {
    layer.reorderLayers(oldIndex, newIndex);
  };

  // Handle drag and drop of assets onto canvas
  const handleAssetDrop = useCallback((
    assetData: { assetId: string; name: string; imageData: string; width: number; height: number },
    x: number,
    y: number
  ) => {
    console.log('Asset dropped on canvas:', assetData.name, 'at', x, y);
    
    // Create asset layer at drop position
    layer.addAssetLayer(
      assetData.assetId,
      assetData.name,
      assetData.imageData,
      assetData.width,
      assetData.height,
      x - assetData.width / 2,  // Center the asset on drop point
      y - assetData.height / 2
    ).then(() => {
      // Track asset usage
      assetContext.useAsset(assetData.assetId);
      
      // Switch to select tool so user can immediately transform the asset
      toolDispatch({
        type: 'SET_ACTIVE_TOOL',
        payload: {
          id: 'select',
          icon: MousePointer2,
          label: 'Select',
          hasSubmenu: true,
          submenuType: 'select'
        }
      });
    });
  }, [layer, assetContext, toolDispatch]);

  // Save a layer as an asset to the Asset Vault
  const handleSaveLayerAsAsset = useCallback((layerId: string, layerName: string) => {
    if (!canvas) {
      console.warn('No canvas available for saving layer as asset');
      return;
    }

    // Get objects for this layer
    const layerObjects = canvas.getObjects().filter(obj => obj.layerId === layerId);
    
    if (layerObjects.length === 0) {
      alert('This layer has no objects to save as an asset.');
      return;
    }

    // Create a temporary canvas to render just this layer's objects
    const tempCanvas = document.createElement('canvas');
    
    // Calculate bounds of all objects in this layer
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layerObjects.forEach(obj => {
      const bounds = obj.getBoundingRect();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.left + bounds.width);
      maxY = Math.max(maxY, bounds.top + bounds.height);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    
    tempCanvas.width = width;
    tempCanvas.height = height;
    
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get 2d context');
      return;
    }

    // Render each object offset by minX, minY
    ctx.translate(-minX, -minY);
    layerObjects.forEach(obj => {
      obj.render(ctx);
    });

    // Get the image data
    const imageData = tempCanvas.toDataURL('image/png');

    // Prompt for tags
    const tagsInput = prompt('Enter tags for this asset (comma-separated):', '');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    // Save to asset vault
    assetContext.createAsset(
      layerName,
      imageData,
      tags,
      'Props', // Default category
      width,
      height,
      layerId
    );

    alert(`Layer "${layerName}" saved to Asset Vault!`);
  }, [canvas, assetContext]);

  // Poll generation job status - defined before handleSelectionApply since it's used as a dependency
  // Automatically applies cutout for asset layers, skips cutout for backgroundPlate layers
  const completedJobsRef = useRef<Set<string>>(new Set());
  const pollGenerationStatus = useCallback(async (jobId: string, bounds?: { left: number; top: number }) => {
    console.log('========== pollGenerationStatus CALLED ==========');
    console.log('jobId:', jobId);
    console.log('bounds:', bounds);
    
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    console.log('API_BASE:', API_BASE);
    
    const poll = async () => {
      console.log('>>> poll() inner function executing for:', jobId);
      try {
        const url = `${API_BASE}/api/generate/status/${jobId}`;
        console.log('Fetching:', url);
        const response = await fetch(url);
        console.log('Response received, ok:', response.ok, 'status:', response.status);
        if (response.ok) {
          const status = await response.json();
          console.log('Parsed status:', { ...status, imageData: status.imageData ? `[${status.imageData.length} chars]` : null });
          
          setGenerationJobs(prev => prev.map(job => 
            job.id === jobId 
              ? { ...job, status: status.status, progress: status.progress, imageData: status.imageData, error: status.error }
              : job
          ));
          
          if (status.status === 'completed') {
            // Guard: don't re-enter completion logic if we already handled this job
            if (completedJobsRef.current.has(jobId)) {
              console.log('[poll] Job already handled, skipping:', jobId);
              return;
            }
            completedJobsRef.current.add(jobId);

            console.warn('=== CLIENT: Generation completed ===', jobId);
            console.warn('CLIENT DEBUG - status.imageData exists:', !!status.imageData);
            console.warn('CLIENT DEBUG - status.imageData length:', status.imageData?.length);
            console.warn('CLIENT DEBUG - canvas exists:', !!canvas);
            
            // Add generated image to canvas as a NEW ASSET LAYER
            if (status.imageData && canvas) {
              const currentLayer = layerRef.current;
              let finalImageData = status.imageData;
              
              // Check if we need to apply cutout for foreground assets
              const assetTypeValue = generationAssetTypeRef.current;
              const isForeground = assetTypeValue === 'foreground';
              console.log('=== CUTOUT CHECK ===');
              console.log('CLIENT: generationAssetTypeRef.current =', assetTypeValue);
              console.log('CLIENT: isForeground =', isForeground);
              
              if (isForeground) {
                // ΓöÇΓöÇ Foreground: open interactive CutoutPanel ΓöÇΓöÇ
                // Entire branch is wrapped in try/catch to prevent poll-retry loops
                try {
                  console.log('[CutoutPanel] Foreground generation complete ΓÇö fetching SAM proposals');
                  setGenerationJobs(prev => prev.map(job =>
                    job.id === jobId
                      ? { ...job, status: 'generating' as const, progress: 95 }
                      : job
                  ));

                  let proposals: MaskProposal[] = [];

                  // Skip SAM if the image is a placeholder SVG or too small to be a real image
                  const isPlaceholder = status.imageData.startsWith('data:image/svg') || status.imageData.length < 5000;
                  if (isPlaceholder) {
                    console.warn('[CutoutPanel] Placeholder image detected (length=%d), skipping SAM proposals', status.imageData.length);
                  } else {
                    try {
                      const proposalResult = await getProposalsMask(status.imageData, 24);
                      console.log('[CutoutPanel] Proposals:', proposalResult.proposals.length, 'results');
                      proposals = proposalResult.success ? proposalResult.proposals : [];
                    } catch (samErr) {
                      console.error('[CutoutPanel] SAM proposals failed, opening panel with no proposals:', samErr);
                    }
                  }

                  setPendingCutout({
                    imageData: status.imageData,
                    proposals,
                    jobId,
                    bounds: bounds as { left: number; top: number; width: number; height: number } | undefined,
                  });
                } finally {
                  // Always mark job as completed ΓÇö never leave at 95%
                  setGenerationJobs(prev => prev.map(job =>
                    job.id === jobId
                      ? { ...job, status: 'completed' as const, progress: 100 }
                      : job
                  ));
                }

                return; // placement deferred to handleCutoutConfirm
              }
              
              // ΓöÇΓöÇ Background: place directly on canvas ΓöÇΓöÇ
              const img = new Image();
              img.onload = async () => {
                const imgWidth = img.width;
                const imgHeight = img.height;
                const posX = bounds?.left || 100;
                const posY = bounds?.top || 100;
                
                const timestamp = new Date().toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: false 
                });
                const assetTypeLabel = isForeground ? 'FG' : 'BG';
                const layerName = `Generated ${assetTypeLabel} ${timestamp}`;
                const assetId = `gen-${jobId}`;
                
                console.warn('CLIENT: Creating new asset layer for generated image:', layerName);
                
                const newAssetLayer = await currentLayer.addAssetLayer(
                  assetId,
                  layerName,
                  finalImageData,
                  imgWidth,
                  imgHeight,
                  posX,
                  posY
                );
                
                if (newAssetLayer) {
                  console.log('CLIENT: Asset layer created successfully:', newAssetLayer.name);
                } else {
                  console.error('CLIENT: Failed to create asset layer, falling back to direct canvas add');
                  const fabricImg = new fabric.Image(img, {
                    left: posX,
                    top: posY,
                    selectable: true,
                    hasControls: true,
                  });
                  canvas.add(fabricImg);
                  canvas.requestRenderAll();
                }
              };
              img.src = finalImageData;
            }
            return;
          }
          
          if (status.status === 'failed') {
            console.error('Generation failed:', status.error);
            return;
          }
          
          // Continue polling
          console.log('Scheduling next poll in 1 second...');
          setTimeout(poll, 1000);
        } else if (response.status === 404) {
          // Job no longer exists (server restarted) ΓÇö stop polling
          console.error('[poll] Job not found (404) ΓÇö server likely restarted, stopping poll for:', jobId);
          setGenerationJobs(prev => prev.map(job =>
            job.id === jobId
              ? { ...job, status: 'failed' as const, error: 'Job lost ΓÇö server restarted' }
              : job
          ));
          return;
        } else {
          // Non-ok response, log and retry
          console.error('Non-ok response:', response.status, await response.text());
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Poll error:', error);
        setTimeout(poll, 2000);
      }
    };
    
    console.log('About to call poll() immediately');
    poll();
    console.log('poll() call initiated');
  }, [canvas, getProposalsMask]);


  const handleSelectionApply = useCallback(async (prompt?: string, model?: 'sd15' | 'sdxl', assetType?: 'foreground' | 'background') => {
    // VERSION MARKER - v2 with layer ref fix
    console.log('CLIENT v2: handleSelectionApply called');
    console.log('CLIENT: Apply action:', selection.activeAction, 'on selection', prompt ? `with prompt: "${prompt}"` : '', model ? `model: ${model}` : '', assetType ? `assetType: ${assetType}` : '');
    // Use layerRef to get most current layer state
    const currentLayerState = layerRef.current;
    console.log('CLIENT: Current layer at generation time (from ref):', currentLayerState.activeLayer?.name, 'type:', currentLayerState.activeLayer?.type);
    
    // Store the asset type for use in pollGenerationStatus
    // Default to 'foreground' if not specified
    const assetTypeToUse = assetType || 'foreground';
    console.log('CLIENT: Setting generationAssetTypeRef to:', assetTypeToUse);
    generationAssetTypeRef.current = assetTypeToUse;
    console.log('CLIENT: generationAssetTypeRef.current is now:', generationAssetTypeRef.current);
    
    if (selection.activeAction === 'generate' && prompt && selection.selectionBounds) {
      setIsGenerating(true);
      setShowGenerationQueue(true);
      
      try {
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        
        // Get base dimensions from selection
        let width = Math.round(selection.selectionBounds.width);
        let height = Math.round(selection.selectionBounds.height);
        
        // Model-specific parameters for better quality
        const isSDXL = model === 'sdxl';
        
        // SDXL works best at 1024x1024 or similar large sizes
        // SD 1.5 works best at 512x512 but can do larger
        const minSize = isSDXL ? 768 : 384;  // Minimum dimension
        const optimalSize = isSDXL ? 1024 : 512;  // Optimal size
        
        // Scale up small selections to minimum size while preserving aspect ratio
        const aspectRatio = width / height;
        if (width < minSize && height < minSize) {
          if (aspectRatio > 1) {
            width = optimalSize;
            height = Math.round(optimalSize / aspectRatio);
          } else {
            height = optimalSize;
            width = Math.round(optimalSize * aspectRatio);
          }
        } else if (width < minSize) {
          width = minSize;
          height = Math.round(minSize / aspectRatio);
        } else if (height < minSize) {
          height = minSize;
          width = Math.round(minSize * aspectRatio);
        }
        
        // Ensure dimensions are multiples of 8 (required by diffusion models)
        width = Math.round(width / 8) * 8;
        height = Math.round(height / 8) * 8;
        
        // More steps = less artifacts but slower
        // SD 1.5: 25-30 steps is good balance
        // SDXL: 25-30 steps works well with DPM scheduler
        const steps = isSDXL ? 30 : 25;
        
        // Guidance scale (CFG)
        // Higher = more adherence to prompt but can be over-saturated
        const guidanceScale = isSDXL ? 7.0 : 7.5;
        
        console.log('Generation params:', {
          model,
          originalSize: `${selection.selectionBounds.width}x${selection.selectionBounds.height}`,
          scaledSize: `${width}x${height}`,
          steps,
          guidanceScale,
        });
        
        const response = await fetch(`${API_BASE}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            negativePrompt: 'blurry, bad quality, distorted, ugly, deformed, low resolution, artifacts, noise',
            width,
            height,
            steps,
            guidanceScale,
            model: model || 'sd15', // Default to quick mode (SD 1.5)
            userId: userId,
            projectId: projectId,
            selectionBounds: selection.selectionBounds,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Generation submitted:', result);
          console.log('Job ID from response:', result.jobId);
          
          // Add to local job tracking
          const newJob = {
            id: result.jobId,
            prompt,
            status: 'pending' as const,
            progress: 0,
          };
          setGenerationJobs(prev => [...prev, newJob]);
          
          // Start polling for status
          console.log('About to call pollGenerationStatus with jobId:', result.jobId);
          pollGenerationStatus(result.jobId, selection.selectionBounds);
          console.log('pollGenerationStatus call completed');
        } else {
          console.error('Generation failed:', await response.text());
        }
      } catch (error) {
        console.error('Generation error:', error);
      } finally {
        setIsGenerating(false);
      }
      
      // Clear selection after triggering generation
      selection.clearSelection();
      return;
    }
    
    // Liquify — open the mesh-warp panel for the selected object
    if (selection.activeAction === 'liquify' && selection.hasObjectsSelected && canvas) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        const rawDataUrl = activeObj.toDataURL({ format: 'png' });
        const tmpImg = new Image();
        tmpImg.onload = () => {
          setPendingLiquify({
            imageData: rawDataUrl,
            width: tmpImg.naturalWidth  || 512,
            height: tmpImg.naturalHeight || 512,
            objectRef: activeObj,
          });
        };
        tmpImg.src = rawDataUrl;
        selection.clearSelection();
        return;
      }
    }

    // Effects panel
    if (selection.activeAction === 'effects' && selection.hasObjectsSelected && canvas) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        const rawDataUrl = activeObj.toDataURL({ format: 'png' });
        const tmpImg = new Image();
        tmpImg.onload = () => {
          setPendingEffects({
            imageData: rawDataUrl,
            width: tmpImg.naturalWidth  || 512,
            height: tmpImg.naturalHeight || 512,
            objectRef: activeObj,
          });
        };
        tmpImg.src = rawDataUrl;
        selection.clearSelection();
        return;
      }
    }

    // For other actions, just clear the selection for now
    if (selection.activeAction === 'edit' && selection.hasObjectsSelected && canvas) {
      // Extract the selected object's image data and open EditPanel
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        // Export as PNG and composite onto white background
        // to avoid transparent areas becoming black in the diffusion pipeline
        const rawDataUrl = activeObj.toDataURL({ format: 'png' });
        const tmpImg = new Image();
        tmpImg.onload = () => {
          const offscreen = document.createElement('canvas');
          // Use the natural pixel dimensions from the exported image.
          // These match what the diffusion pipeline will receive ΓÇö avoids
          // mismatches between mask size, image size, and req.width/height.
          const natW = tmpImg.naturalWidth;
          const natH = tmpImg.naturalHeight;
          offscreen.width = natW;
          offscreen.height = natH;
          const octx = offscreen.getContext('2d')!;
          // White background fill
          octx.fillStyle = '#ffffff';
          octx.fillRect(0, 0, natW, natH);
          // Draw image on top (alpha composites onto white)
          octx.drawImage(tmpImg, 0, 0);
          const composited = offscreen.toDataURL('image/png');

          setPendingEdit({
            imageData: composited,
            width: natW || 512,
            height: natH || 512,
            objectRef: activeObj,
          });
        };
        tmpImg.src = rawDataUrl;
        selection.clearSelection();
        return;
      }
    }
    selection.clearSelection();
  }, [selection, pollGenerationStatus, canvas]);

  // ΓöÇΓöÇ EditPanel callbacks ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  // Ref to keep object references for background edit jobs so we can
  // auto-apply the result to the correct canvas object when it arrives.
  const editObjectRefs = useRef<Map<string, { ref: fabric.FabricObject | null; width: number; height: number }>>(new Map());

  /** Poll the edit job status endpoint and update generationJobs + auto-apply result. */
  const pollEditStatus = useCallback(async (serverJobId: string, clientJobId: string) => {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const MAX_POLLS = 1200; // 10 min @ 500ms (matches server's 10-min timeout)
    let polls = 0;

    const poll = async () => {
      if (polls++ >= MAX_POLLS) {
        setGenerationJobs(prev => prev.map(j =>
          j.id === clientJobId ? { ...j, status: 'failed' as const, error: 'Edit timed out' } : j,
        ));
        editObjectRefs.current.delete(clientJobId);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/edit/status/${serverJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setGenerationJobs(prev => prev.map(j =>
              j.id === clientJobId ? { ...j, status: 'failed' as const, error: 'Job lost ΓÇö server restarted' } : j,
            ));
            editObjectRefs.current.delete(clientJobId);
            return;
          }
          setTimeout(poll, 2000);
          return;
        }

        const status = await res.json() as {
          status: string; progress: number; imageData?: string; processingTime?: number; error?: string;
        };

        // Update queue panel progress
        setGenerationJobs(prev => prev.map(j =>
          j.id === clientJobId
            ? { ...j, status: status.status as any, progress: status.progress, imageData: status.imageData, error: status.error }
            : j,
        ));

        if (status.status === 'completed' && status.imageData) {
          // ΓöÇΓöÇ Auto-apply to the original object ΓöÇΓöÇ
          const saved = editObjectRefs.current.get(clientJobId);

          // Ensure the imageData has a valid data URI prefix
          const imgSrc = status.imageData.startsWith('data:')
            ? status.imageData
            : `data:image/png;base64,${status.imageData}`;

          console.log('[edit] Job completed ΓÇö applying result. dataLen=%d hasRef=%s isImage=%s',
            status.imageData.length, !!saved?.ref, saved?.ref instanceof fabric.FabricImage);

          if (saved?.ref && saved.ref instanceof fabric.FabricImage && canvas) {
            // Replace the object entirely ΓÇö setElement alone doesn't reliably
            // invalidate Fabric 6's render cache. Building a fresh FabricImage
            // from the data URL is the safest approach.
            const oldImg = saved.ref as fabric.FabricImage;
            const prevLeft = oldImg.left;
            const prevTop = oldImg.top;
            const prevScaleX = oldImg.scaleX ?? 1;
            const prevScaleY = oldImg.scaleY ?? 1;
            const prevAngle = oldImg.angle ?? 0;
            // Copy any custom props the layer system relies on
            const layerId = (oldImg as any).layerId;
            const objId = (oldImg as any).id;

            fabric.FabricImage.fromURL(imgSrc).then((newImg) => {
              // Maintain the same visual footprint on canvas
              if (newImg.width && newImg.height) {
                newImg.scaleX = (saved.width * prevScaleX) / newImg.width;
                newImg.scaleY = (saved.height * prevScaleY) / newImg.height;
              }
              newImg.set({
                left: prevLeft,
                top: prevTop,
                angle: prevAngle,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true,
              });
              if (layerId) (newImg as any).layerId = layerId;
              if (objId) (newImg as any).id = objId;

              // Swap on canvas: remove old, add new at same index
              const idx = canvas.getObjects().indexOf(oldImg);
              canvas.remove(oldImg);
              if (idx >= 0) {
                canvas.insertAt(idx, newImg);
              } else {
                canvas.add(newImg);
              }
              canvas.setActiveObject(newImg);
              canvas.requestRenderAll();
              console.log('[edit] Γ£ô Replaced canvas object with edited result (%dx%d)', newImg.width, newImg.height);
            }).catch((err) => {
              console.error('[edit] Γ£ù Failed to create FabricImage from result:', err);
              const bounds = oldImg.getBoundingRect();
              const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              layer.addAssetLayer(clientJobId, `Edited ${ts}`, imgSrc, saved.width, saved.height, bounds?.left, bounds?.top);
            });
          } else if (canvas && saved) {
            // No existing FabricImage ref ΓÇö add as a brand-new layer
            const bounds = saved.ref?.getBoundingRect();
            const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            layer.addAssetLayer(clientJobId, `Edited ${timestamp}`, imgSrc, saved.width, saved.height, bounds?.left, bounds?.top);
            console.log('[edit] Γ£ô Added edited result as new layer');
          }
          editObjectRefs.current.delete(clientJobId);
          return;
        }

        if (status.status === 'failed') {
          editObjectRefs.current.delete(clientJobId);
          return;
        }

        // Still in progress ΓÇö keep polling
        setTimeout(poll, 1000);
      } catch {
        setTimeout(poll, 2000);
      }
    };

    poll();
  }, [canvas, layer]);

  const handleEditGenerate = useCallback((params: EditGenerateParams) => {
    if (!pendingEdit) return;

    const clientJobId = `edit-${Date.now()}`;
    const { imageData: srcImageData, objectRef, width: editW, height: editH } = pendingEdit;

    // Stash the object ref so we can apply the result later
    editObjectRefs.current.set(clientJobId, { ref: objectRef, width: editW, height: editH });

    // Add to the generation queue immediately
    setGenerationJobs(prev => [...prev, {
      id: clientJobId,
      prompt: `${params.prompt}`,
      status: 'pending' as const,
      progress: 0,
    }]);
    setShowGenerationQueue(true);

    // Close the edit panel ΓÇö user is free to continue working
    setPendingEdit(null);

    // Submit the edit job (returns jobId immediately, server processes in background)
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const body: Record<string, unknown> = {
      imageData:       srcImageData,
      prompt:          params.prompt,
      mode:            params.mode,
      strength:        params.strength,
      steps:           20,
      guidanceScale:   7.5,
      width:           params.width,
      height:          params.height,
    };
    if (params.maskData)            body.maskData           = params.maskData;
    if (params.referenceImageData)  body.referenceImageData = params.referenceImageData;
    if (params.ipAdapterScale)      body.ipAdapterScale     = params.ipAdapterScale;
    if (params.padding)             body.padding            = params.padding;

    fetch(`${API_BASE}/api/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(res => {
        if (!res.ok) throw new Error(`Edit submit error: ${res.status}`);
        return res.json();
      })
      .then((data: { success: boolean; jobId: string }) => {
        if (data.success && data.jobId) {
          // Start polling the server for status
          pollEditStatus(data.jobId, clientJobId);
        } else {
          setGenerationJobs(prev => prev.map(j =>
            j.id === clientJobId ? { ...j, status: 'failed' as const, error: 'Failed to submit edit job' } : j,
          ));
          editObjectRefs.current.delete(clientJobId);
        }
      })
      .catch(err => {
        setGenerationJobs(prev => prev.map(j =>
          j.id === clientJobId
            ? { ...j, status: 'failed' as const, error: err instanceof Error ? err.message : 'Unknown error' }
            : j,
        ));
        editObjectRefs.current.delete(clientJobId);
      });
  }, [pendingEdit, pollEditStatus]);

  const handleEditClose = useCallback(() => {
    setPendingEdit(null);
  }, []);

  // -- LiquifyPanel callbacks -------------------------------------------

  /** Replace the original canvas object with the warped PNG result. */
  const handleLiquifyApply = useCallback((resultImageData: string) => {
    if (!canvas || !pendingLiquify) {
      setPendingLiquify(null);
      return;
    }
    const { objectRef } = pendingLiquify;
    // Load via a plain Image element so we avoid crossOrigin quirks with
    // data-URLs that can cause FabricImage.fromURL to silently resolve with a
    // blank image in some browser / Fabric-v6 configurations.
    const img = new Image();
    img.onload = () => {
      const newImg = new fabric.FabricImage(img, {
        left:        (objectRef as any)?.left   ?? 0,
        top:         (objectRef as any)?.top    ?? 0,
        scaleX:      (objectRef as any)?.scaleX ?? 1,
        scaleY:      (objectRef as any)?.scaleY ?? 1,
        angle:       (objectRef as any)?.angle  ?? 0,
        selectable:  true,
        evented:     true,
        hasControls: true,
        hasBorders:  true,
      });
      (newImg as any).layerId = (objectRef as any)?.layerId;
      if (objectRef) {
        const idx = canvas.getObjects().indexOf(objectRef);
        canvas.remove(objectRef);
        if (idx >= 0) {
          canvas.insertAt(idx, newImg);
        } else {
          canvas.add(newImg);
        }
      } else {
        canvas.add(newImg);
      }
      canvas.setActiveObject(newImg);
      canvas.requestRenderAll();
      setPendingLiquify(null);
    };
    img.src = resultImageData;
  }, [canvas, pendingLiquify]);

  const handleLiquifyClose = useCallback(() => setPendingLiquify(null), []);

  // -- EffectsPanel callbacks ------------------------------------------

  const handleEffectsApply = useCallback((resultImageData: string) => {
    if (!canvas || !pendingEffects) { setPendingEffects(null); return; }
    const { objectRef } = pendingEffects;
    const img = new Image();
    img.onload = () => {
      const newImg = new fabric.FabricImage(img, {
        left:        (objectRef as any)?.left   ?? 0,
        top:         (objectRef as any)?.top    ?? 0,
        scaleX:      (objectRef as any)?.scaleX ?? 1,
        scaleY:      (objectRef as any)?.scaleY ?? 1,
        angle:       (objectRef as any)?.angle  ?? 0,
        selectable:  true,
        evented:     true,
        hasControls: true,
        hasBorders:  true,
      });
      (newImg as any).layerId = (objectRef as any)?.layerId;
      if (objectRef) {
        const idx = canvas.getObjects().indexOf(objectRef);
        canvas.remove(objectRef);
        if (idx >= 0) {
          canvas.insertAt(idx, newImg);
        } else {
          canvas.add(newImg);
        }
      } else {
        canvas.add(newImg);
      }
      canvas.setActiveObject(newImg);
      canvas.requestRenderAll();
      setPendingEffects(null);
    };
    img.src = resultImageData;
  }, [canvas, pendingEffects]);

  const handleEffectsClose = useCallback(() => setPendingEffects(null), []);

  // ΓöÇΓöÇ CutoutPanel callbacks ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  /**
   * Scan the alpha channel of an RGBA data-URL and return the tightest
   * bounding box that encloses all non-transparent pixels.
   * Returns { croppedUrl, offsetX, offsetY } where offsetX/Y are the pixel
   * offsets of the crop within the original image.
   */
  const tightCrop = useCallback(
    (dataUrl: string): Promise<{ croppedUrl: string; offsetX: number; offsetY: number }> =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const oc = document.createElement('canvas');
          oc.width  = img.width;
          oc.height = img.height;
          const ctx = oc.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const { data } = ctx.getImageData(0, 0, oc.width, oc.height);

          let minX = oc.width, minY = oc.height, maxX = 0, maxY = 0;
          for (let y = 0; y < oc.height; y++) {
            for (let x = 0; x < oc.width; x++) {
              const alpha = data[(y * oc.width + x) * 4 + 3];
              if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (minX > maxX || minY > maxY) {
            // Fully transparent ΓÇö return original
            resolve({ croppedUrl: dataUrl, offsetX: 0, offsetY: 0 });
            return;
          }

          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const out = document.createElement('canvas');
          out.width  = cropW;
          out.height = cropH;
          out.getContext('2d')!.drawImage(oc, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
          resolve({ croppedUrl: out.toDataURL('image/png'), offsetX: minX, offsetY: minY });
        };
        img.src = dataUrl;
      }),
    [],
  );

  const handleCutoutConfirm = useCallback(async (
    maskData: string[],
    settings: Partial<CutoutSettings>,
  ) => {
    if (!pendingCutout) return;
    const { imageData, jobId, bounds: cutoutBounds } = pendingCutout;
    setPendingCutout(null);

    let finalImageData = imageData;
    // cropBox from server: [left, top, width, height] in original-image px
    let serverCropBox: [number, number, number, number] | undefined;
    // Original image size (before crop) — needed to map crop offset to canvas
    let origW = 0;
    let origH = 0;

    if (maskData.length > 0) {
      try {
        const result = await applyMaskCutout(imageData, maskData, settings);
        if (result.success && result.imageData) {
          finalImageData = result.imageData;
          serverCropBox  = result.cropBox;
          if (result.originalSize) {
            [origW, origH] = result.originalSize;
          }
        } else {
          console.warn('[CutoutPanel] applyMask failed, using original');
        }
      } catch (e) {
        console.error('[CutoutPanel] applyMask error, using original', e);
      }
    }

    const currentLayer = layerRef.current;
    const img = new Image();
    img.onload = async () => {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const layerName = `Generated FG ${timestamp}`;
      const assetId   = `gen-${jobId}`;

      const baseX = cutoutBounds?.left ?? 100;
      const baseY = cutoutBounds?.top  ?? 100;

      // Map the server's crop offset to canvas space.
      // canvasScaleX/Y converts from server-image pixels → canvas pixels.
      let posX = baseX;
      let posY = baseY;
      let canvasScaleX = 1;
      let canvasScaleY = 1;
      if (serverCropBox && origW > 0 && origH > 0 && cutoutBounds?.width && cutoutBounds?.height) {
        canvasScaleX = cutoutBounds.width  / origW;
        canvasScaleY = cutoutBounds.height / origH;
        posX = baseX + serverCropBox[0] * canvasScaleX;
        posY = baseY + serverCropBox[1] * canvasScaleY;
      }

      // Scale the tight-cropped image dimensions to canvas coordinates.
      // img.width/height are the server-pixel dimensions of the cropped result;
      // multiplying by canvasScale converts them to the correct canvas-pixel
      // footprint, preserving the subject's proportional size within the
      // original generation bounds.
      const targetW = img.width  * canvasScaleX;
      const targetH = img.height * canvasScaleY;

      const newAssetLayer = await currentLayer.addAssetLayer(
        assetId, layerName, finalImageData, targetW, targetH, posX, posY,
      );
      if (!newAssetLayer && canvas) {
        // Fallback: add directly via FabricImage.fromURL to preserve alpha
        try {
          const fabricImg = await fabric.FabricImage.fromURL(finalImageData, { crossOrigin: 'anonymous' });
          const natW = fabricImg.width ?? 1;
          const natH = fabricImg.height ?? 1;
          fabricImg.set({
            left: posX,
            top: posY,
            scaleX: targetW / natW,
            scaleY: targetH / natH,
            selectable: true,
            hasControls: true,
            hasBorders: true,
            evented: true,
          });
          canvas.add(fabricImg);
          canvas.setActiveObject(fabricImg);
          canvas.requestRenderAll();
        } catch (fallbackErr) {
          console.error('[CutoutConfirm] Fallback FabricImage.fromURL failed:', fallbackErr);
        }
      }

      // Switch to select tool so the user can immediately transform the placed image
      toolDispatch({
        type: 'SET_ACTIVE_TOOL',
        payload: {
          id: 'select',
          icon: MousePointer2,
          label: 'Select',
          hasSubmenu: true,
          submenuType: 'select',
        },
      });
    };
    img.src = finalImageData;
  }, [pendingCutout, applyMaskCutout, tightCrop, canvas, layerRef, toolDispatch]);

  const handleCutoutCancel = useCallback(() => {
    if (!pendingCutout) return;
    setGenerationJobs(prev => prev.filter(j => j.id !== pendingCutout.jobId));
    setPendingCutout(null);
  }, [pendingCutout]);

  // Export canvas composite as PNG or JPEG
  const handleExport = useCallback((format: 'png' | 'jpeg') => {
    if (!canvas) {
      toast.addToast('No canvas to export', 'warning');
      return;
    }

    try {
      const dataURL = canvas.toDataURL({
        format,
        quality: format === 'jpeg' ? 0.92 : undefined,
        multiplier: 1,
      });

      const link = document.createElement('a');
      link.download = `concept-export.${format === 'jpeg' ? 'jpg' : 'png'}`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.addToast(`Exported as ${format.toUpperCase()}`, 'success', 1500);
    } catch (err) {
      console.error('Export failed:', err);
      toast.addToast('Export failed', 'error');
    }
  }, [canvas, toast]);

  // Auto-save current canvas state as "Current" snapshot before viewing history
  const handleViewHistory = useCallback(() => {
    if (!canvas) {
      console.warn('No canvas available for snapshot');
      navigate('/timeline');
      return;
    }

    // Log canvas state before saving
    const objects = canvas.getObjects();
    console.log('Canvas state before saving:');
    console.log('  - Total objects:', objects.length);
    console.log('  - Layers:', layer.layers.length);
    objects.forEach((obj, i) => {
      console.log(`  - Object ${i}: type=${obj.type}, layerId=${obj.layerId}`);
    });

    // Update the "Current" snapshot with current canvas state
    versionContext.updateCurrentSnapshot();
    console.log('Snapshot save initiated');
    
    // Small delay to ensure WebSocket message is sent before navigation
    setTimeout(() => {
      navigate('/timeline');
    }, 100);
  }, [canvas, layer.layers, versionContext, navigate]);

  // Calculate smart tag position — convert scene coordinates to screen/DOM
  // coordinates so the tag lines up with the selection on screen.
  const getSmartTagPosition = () => {
    if (!selection.selectionBounds) return { x: 0, y: 0 };

    // Scene-space center-bottom of the selection
    const sceneX = selection.selectionBounds.left + selection.selectionBounds.width / 2;
    const sceneY = selection.selectionBounds.top + selection.selectionBounds.height;

    if (canvas) {
      const vpt = canvas.viewportTransform;
      // Apply viewport transform (zoom + pan) to get canvas-px coords
      const canvasPxX = vpt[0] * sceneX + vpt[2] * sceneY + vpt[4];
      const canvasPxY = vpt[1] * sceneX + vpt[3] * sceneY + vpt[5];

      // Offset by the canvas element's position within the DOM
      const el = canvas.getElement() as HTMLCanvasElement;
      const rect = el.getBoundingClientRect();

      return { x: rect.left + canvasPxX, y: rect.top + canvasPxY };
    }

    // Fallback when canvas isn't ready — raw scene coords
    return { x: sceneX, y: sceneY };
  };

  return (
    <WorkspaceLayout>
      {/* Toast Notifications for layer constraints */}
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* ΓöÇΓöÇ AI Cutout Panel (foreground generation only) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      {pendingCutout && (
        <div className="fixed inset-0 z-50 flex items-stretch bg-black/80 backdrop-blur-sm">
          {/* Left: full image context */}
          <div className="flex-1 flex items-center justify-center p-8 bg-[#0a0e17]">
            <img
              src={pendingCutout.imageData}
              alt="Generated"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10"
            />
          </div>
          {/* Right: cutout panel */}
          <div className="w-[340px] border-l border-white/10 bg-background-dark overflow-hidden">
            <CutoutPanel
              imageData={pendingCutout.imageData}
              proposals={pendingCutout.proposals}
              isLoading={false}
              onConfirm={handleCutoutConfirm}
              onClose={handleCutoutCancel}
            />
          </div>
        </div>
      )}

      {/* ΓöÇΓöÇ AI Edit Panel (inpaint / outpaint)*/}
      {pendingEdit && (
        <EditPanel
          imageData={pendingEdit.imageData}
          imageWidth={pendingEdit.width}
          imageHeight={pendingEdit.height}
          onGenerate={handleEditGenerate}
          onClose={handleEditClose}
        />
      )}

      {/* Liquify Panel */}
      {pendingLiquify && (
        <LiquifyPanel
          imageData={pendingLiquify.imageData}
          imageWidth={pendingLiquify.width}
          imageHeight={pendingLiquify.height}
          onApply={handleLiquifyApply}
          onClose={handleLiquifyClose}
        />
      )}

      {/* Effects Panel */}
      {pendingEffects && (
        <EffectsPanel
          imageData={pendingEffects.imageData}
          imageWidth={pendingEffects.width}
          imageHeight={pendingEffects.height}
          onApply={handleEffectsApply}
          onClose={handleEffectsClose}
        />
      )}

      {/* Canvas Area */}
      <CanvasArea canvasRef={canvasRef} onAssetDrop={handleAssetDrop} />

      {/* Top Utility Bar */}
      <TopUtilityBar
        onBack={() => window.history.back()}
        onShare={() => setShowInvitationModal(true)}
        onSyncSettings={() => setShowSyncSettings((v) => !v)}
        onExport={handleExport}
        isLive={true}
        collaborators={collaborators}
      />

      {/* Left Tool Rail with Brush Submenu */}
      <ToolRail
        brushSize={brushProps.lineWidth}
        brushOpacity={brushProps.brushOpacity}
        brushColor={brushProps.color}
        onBrushSizeChange={brushProps.setLineWidth}
        onBrushOpacityChange={brushProps.setBrushOpacity}
        onColorChange={brushProps.setColor}
        brushProps={brushProps}
        selectionMode={selection.mode}
        onSelectionModeChange={selection.setMode}
        magicThreshold={selection.magicThreshold}
        onMagicThresholdChange={selection.setMagicThreshold}
        onAssetVaultClick={() => setShowAssetVault(!showAssetVault)}
      />

      {/* Right Panel - Show either Layers or Asset Vault */}
      {showAssetVault ? (
        <AssetVaultPanel
          onAssetSelect={(asset) => {
            layer.addAssetLayer(
              asset.id,
              asset.name,
              asset.imageData,
              asset.width,
              asset.height
            ).then(() => {
              assetContext.useAsset(asset.id);
              setShowAssetVault(false);
            });
          }}
        />
      ) : (
        <LayersPanel
          layers={layer.layers}
          activeLayer={layer.activeLayer}
          onLayerSelect={layer.switchLayer}
          onAddLayer={layer.addLayer}
          onToggleVisibility={layer.updateLayerVisibility}
          onLayerTypeChange={handleLayerTypeChange}
          onReorderLayers={handleReorderLayers}
          onViewHistory={handleViewHistory}
          onSaveLayerAsAsset={handleSaveLayerAsAsset}
          onOpacityChange={layer.updateLayerOpacity}
          onBlendModeChange={layer.updateLayerBlendMode}
          onLockToggle={layer.toggleLayerLock}
          onRemoveLayer={layer.removeLayer}
        />
      )}

      {/* Bottom Action Bar */}
      <BottomActionBar
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDiffusionClick={handleDiffusionPrompt}
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
      />


      {/* Selection Smart Tag - shows when there's an active selection */}
      {selection.hasSelection && selection.selectionBounds && (
        <SelectionSmartTag
          hasObjectsSelected={selection.hasObjectsSelected}
          activeAction={selection.activeAction}
          onActionChange={selection.setActiveAction}
          position={getSmartTagPosition()}
          onApply={handleSelectionApply}
          onCancel={selection.clearSelection}
          isGenerating={isGenerating}
        />
      )}

      {/* Generation Queue Panel */}
      {showGenerationQueue && (
        <GenerationQueuePanel 
          jobs={generationJobs}
          onClose={() => setShowGenerationQueue(false)}
          onCancelJob={(jobId) => setGenerationJobs(prev => prev.filter(j => j.id !== jobId))}
          onAddToCanvas={(job) => {
            if (job.imageData && canvas) {
              const img = new Image();
              img.onload = () => {
                const fabricImg = new fabric.Image(img, {
                  left: 100,
                  top: 100,
                  layerId: layer.activeLayer?.id,
                });
                canvas.add(fabricImg);
                canvas.requestRenderAll();
              };
              img.src = job.imageData;
            }
          }}
          onClearCompleted={() => setGenerationJobs(prev => prev.filter(j => j.status !== 'completed' && j.status !== 'failed'))}
        />
      )}

      {/* Sync Settings Slide Panel */}
      {showSyncSettings && (
        <div className="absolute top-16 right-6 z-40 w-[420px] max-h-[calc(100vh-5rem)] overflow-y-auto pointer-events-auto">
          <SyncSettings
            currentSnapshotId={versionContext.currentSnapshotId ?? undefined}
            onClose={() => setShowSyncSettings(false)}
          />
        </div>
      )}

      {/* Session Invitation Modal */}
      <Modal
        isOpen={showInvitationModal}
        onClose={() => setShowInvitationModal(false)}
        title="Session Invitation"
        Accept={() => setShowInvitationModal(false)}
      >
        <p>Share this session with your team.</p>
      </Modal>
    </WorkspaceLayout>
  );
};
