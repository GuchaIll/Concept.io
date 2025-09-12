import {ToolBar} from './Panel/ToolBar';
import { LayerPanel } from './Controls/Layer/LayerPanel';
import { useCanvasContext } from '../contexts/CanvasContext';

export const FCanvas = ( ) => {
  const { canvasRef, layer, brushProps } = useCanvasContext();
 
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
        moveLayerDown={layer.moveLayerDown}
      />
      <canvas
        ref={canvasRef}
        className="absolute border border-indigo-600 mt-10"
      />
    </>
  );
};