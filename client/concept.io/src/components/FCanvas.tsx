import { useCanvasContext } from '../contexts/CanvasContext';
import { useVersionContext } from '../contexts/VersionContext';
import Modal from './Modal/SessionInvitationModal';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  WorkspaceLayout,
  CanvasArea,
  TopUtilityBar,
  ToolRail,
  LayersPanel,
  BottomActionBar,
  AssetLibraryButton,
} from './Workspace';
import { SelectionSmartTag } from './Workspace/SelectionSmartTag';
import type { LayerType } from '../hooks/Layer';
import { useWebSocket } from '../hooks/useWebSocket';
import * as fabric from 'fabric';

// Configuration - in production these would come from env/context
const PROJECT_ID = 'project-demo-1';
const USER_ID = 'user-demo-1';

export const FCanvas = () => {
  const { canvasRef, canvas, layer, brushProps, zoomLevel, zoomIn, zoomOut, resetZoom, history, selection } = useCanvasContext();
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [_showAssetLibrary, setShowAssetLibrary] = useState(false);
  const navigate = useNavigate();
  const hasRestoredSnapshot = useRef(false);

  // Connect to WebSocket for real-time version control sync
  const { socket } = useWebSocket({
    projectId: PROJECT_ID,
    userId: USER_ID,
    autoConnect: true,
  });

  // Use shared version context
  const versionContext = useVersionContext();

  // Connect canvas and layers to version context when they change
  useEffect(() => {
    versionContext.setCanvas(canvas);
  }, [canvas, versionContext.setCanvas]);

  useEffect(() => {
    versionContext.setLayers(layer.layers);
  }, [layer.layers, versionContext.setLayers]);

  useEffect(() => {
    versionContext.setSocket(socket);
  }, [socket, versionContext.setSocket]);

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

    // Check if snapshot has actual data
    const hasObjects = snapshotToRestore.layers.some(l => {
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
    
    // Use a sequential approach to maintain layer order
    const restoreLayerObjects = async () => {
      // Add objects from lowest zIndex to highest (bottom to top)
      for (const layerSnapshot of sortedLayers) {
        try {
          const objects = JSON.parse(layerSnapshot.objects || '[]');
          console.log(`Restoring layer "${layerSnapshot.name}" (zIndex: ${layerSnapshot.zIndex}): ${objects.length} objects`);
          if (objects.length === 0) continue;

          totalObjects += objects.length;
          
          // Enliven and add objects for this layer
          for (const objData of objects) {
            try {
              const enlivenedObjects = await fabric.util.enlivenObjects([objData]);
              enlivenedObjects.forEach((obj: fabric.FabricObject) => {
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
      
      canvas.requestRenderAll();
      console.log('Canvas restoration complete:', snapshotToRestore.name, 'total objects:', totalObjects);
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
    // TODO: Open diffusion prompt modal
    console.log('Open diffusion prompt');
  };

  const handleLayerTypeChange = (layerId: string, type: LayerType) => {
    layer.updateLayerType(layerId, type);
  };

  const handleReorderLayers = (oldIndex: number, newIndex: number) => {
    layer.reorderLayers(oldIndex, newIndex);
  };

  const handleSelectionApply = () => {
    console.log('Apply action:', selection.activeAction, 'on selection');
    // TODO: Implement action based on selection.activeAction
    // For now, just clear the selection
    selection.clearSelection();
  };

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

  // Calculate smart tag position (center-bottom of selection)
  const getSmartTagPosition = () => {
    if (!selection.selectionBounds) return { x: 0, y: 0 };
    return {
      x: selection.selectionBounds.left + selection.selectionBounds.width / 2,
      y: selection.selectionBounds.top + selection.selectionBounds.height,
    };
  };

  return (
    <WorkspaceLayout>
      {/* Canvas Area */}
      <CanvasArea canvasRef={canvasRef} />

      {/* Top Utility Bar */}
      <TopUtilityBar
        onBack={() => window.history.back()}
        onShare={() => setShowInvitationModal(true)}
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
      />

      {/* Right Layers Panel */}
      <LayersPanel
        layers={layer.layers}
        activeLayer={layer.activeLayer}
        onLayerSelect={layer.switchLayer}
        onAddLayer={layer.addLayer}
        onToggleVisibility={layer.updateLayerVisibility}
        onLayerTypeChange={handleLayerTypeChange}
        onReorderLayers={handleReorderLayers}
        onViewHistory={handleViewHistory}
      />

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

      {/* Asset Library Button */}
      <AssetLibraryButton onClick={() => setShowAssetLibrary(true)} />

      {/* Selection Smart Tag - shows when there's an active selection */}
      {selection.hasSelection && selection.selectionBounds && (
        <SelectionSmartTag
          hasObjectsSelected={selection.hasObjectsSelected}
          activeAction={selection.activeAction}
          onActionChange={selection.setActiveAction}
          position={getSmartTagPosition()}
          onApply={handleSelectionApply}
          onCancel={selection.clearSelection}
        />
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
