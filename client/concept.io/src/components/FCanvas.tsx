import { useEffect, useRef, useState, useCallback } from 'react';
import { useTool } from '../contexts/ToolContext';
import {ToolBar} from './Panel/ToolBar';
import { LayerPanel } from './Controls/Layer/LayerPanel';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useZoomPan } from '../hooks/ZoomPan';

export const FCanvas = () => {
  const { state: toolState } = useTool();
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const { canvasRef, canvas, layer } = useCanvasContext();
  const { zoomLevel } = useZoomPan(canvas);

    //  useEffect(() => {
    //   if (!canvasRef.current) return;

    //   const newCanvas = new fabric.Canvas(canvasRef.current, {
    //     height: window.innerHeight,
    //     width: window.innerWidth,
    //     backgroundColor: 'white',
    //     isDrawingMode: true,
    //   });

    //   setCanvas(newCanvas);

    //   return () => {
    //     newCanvas.dispose();
       
    //   };
    // }, []);

  // const handleToolChange = useCallback(() => {
  //   if (!canvas || !toolState.activeTool || !isCanvasReady) return;

  //   switch (toolState.activeToolId) {
  //     case 'brush':
  //       canvas.isDrawingMode = true;
  //       canvas.selection = false;
  //       break;
  //     case 'pan':
  //       canvas.isDrawingMode = false;
  //       canvas.selection = false;
  //       break;
  //     default:
  //       canvas.isDrawingMode = false;
  //       canvas.selection = true;
  //   }
  // }, [canvas, toolState.activeToolId, isCanvasReady]);

  // useEffect(() => {
  //   if (isCanvasReady) {
  //     handleToolChange();
  //   }
  // }, [handleToolChange, isCanvasReady]);

  return (
    <>
      <ToolBar />
      <LayerPanel 
        layers={layer.layers}
        activeLayer={layer.activeLayer}
        setActiveLayer={layer.setActiveLayer}
        addLayer={layer.addLayer}
        removeLayer={layer.removeLayer}
        updateLayerVisibility={layer.updateLayerVisibility}
        updateLayerOpacity={layer.updateLayerOpacity}
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