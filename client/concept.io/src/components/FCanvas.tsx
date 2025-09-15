import {ToolBar} from './Panel/ToolBar';
import { LayerPanel } from './Controls/Layer/LayerPanel';
import { useCanvasContext } from '../contexts/CanvasContext';
import { NavigationSubmenu } from './Submenu/NavigationSubmenu';
import SessionParticipants from './Editor/SessionParticipants';
import Modal from './Modal/SessionInvitationModal';
import { useState } from 'react';

export const FCanvas = ( ) => {
  const { canvasRef, layer, brushProps } = useCanvasContext();
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  
 
  return (
    <>
      <ToolBar
        {...brushProps}
        handleColorChange={brushProps.handleColorChange}
        restorePreviousColor={brushProps.restorePreviousColor}
      />
      <LayerPanel
        layers={layer.layers}
        activeLayer={layer.activeLayer}
        setActiveLayer={layer.setActiveLayer}
        addLayer={layer.addLayer}
        removeLayer={layer.removeLayer}
        updateLayerType={layer.updateLayerType}
        updateLayerVisibility={layer.updateLayerVisibility}
        updateLayerOpacity={layer.updateLayerOpacity}
        updateLayerBlendMode={layer.updateLayerBlendMode}
        moveLayerUp={layer.moveLayerUp}
        switchLayer={layer.switchLayer}
        moveLayerDown={layer.moveLayerDown}
      />
      <NavigationSubmenu  />
      <SessionParticipants />
      <Modal isOpen={showInvitationModal} onClose={() => {setShowInvitationModal(false)}} title="Session Invitation " Accept={() => {setShowInvitationModal(false)}}>
        <p>Kilmu has invited you to join the session.</p>
      </Modal>
      <canvas
        ref={canvasRef}
        className="absolute border border-indigo-600 mt-10"
      />
      
    </>
  );
};