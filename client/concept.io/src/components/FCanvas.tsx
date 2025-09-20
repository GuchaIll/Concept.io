import {ToolBar} from './Panel/ToolBar';
import { LayerPanel } from './Controls/Layer/LayerPanel';
import { useCanvasContext } from '../contexts/CanvasContext';
import { NavigationSubmenu } from './Submenu/NavigationSubmenu';
import SessionParticipants from './Editor/SessionParticipants';
import Modal from './Modal/SessionInvitationModal';
import ChatHistory from './ChatHistory';
import { useState } from 'react';
import CustomBrushProperties from "./Editor/CustomBrushProperties.tsx";

export const FCanvas = ( ) => {
  const { canvasRef, layer, brushProps } = useCanvasContext();
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  
 
  return (
    <div className="relative w-full h-full overflow-hidden">
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
        <div className = "fixed bottom-0 right-0 z-50">
            <ChatHistory />
        </div>
        <div className = "fixed bottom-12 left-0 z-50 max-w-[200px] max-h-[200px]">
            <CustomBrushProperties/>
        </div>
      
       
      <canvas
        ref={canvasRef}
        className="absolute inset-0 border border-indigo-600 "
      />
      
    </div>
  );
};