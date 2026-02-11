import { useCanvasContext } from '../contexts/CanvasContext';
import Modal from './Modal/SessionInvitationModal';
import { useState } from 'react';
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

export const FCanvas = () => {
  const { canvasRef, layer, brushProps, zoomLevel, zoomIn, zoomOut, resetZoom, history, selection } = useCanvasContext();
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [_showAssetLibrary, setShowAssetLibrary] = useState(false);

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
        onViewHistory={() => console.log('View history')}
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
