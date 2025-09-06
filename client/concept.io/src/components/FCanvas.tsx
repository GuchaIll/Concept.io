import {useEffect, useState, useRef} from 'react'
import * as fabric from 'fabric';
import {useBrush} from '../hooks/Brush';
import {useLayers} from '../hooks/Layer';
import { useHistory } from '../hooks/History';
import { LayerPanel } from './Controls/Layer/LayerPanel';
import { ColorPicker } from './Controls/Selector/ColorPicker';
import ToolBar from './Panel/ToolBar';
import { EyeDropper } from '../hooks/EyeDropper';
import {useShape} from '../hooks/Shape';
import {useText} from '../hooks/Text';



declare module 'fabric' {
  export interface FabricObject {
    id?: string;
    layerId?: string;
    baseOpacity?:number;
  }
}


const FCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [drawingModeOn, setDrawingModeOn] = useState<boolean>(true);
    
    const brushProps = useBrush(canvas);
    const historyProps = useHistory(canvas);
    const layerProps = useLayers(canvas);
    const eyeDropperProps = EyeDropper(canvas);
    const shapeProps = useShape(canvas);
    const textProps = useText(canvas);
  

    useEffect(() => {
      if (!canvasRef.current) return;

      const newCanvas = new fabric.Canvas(canvasRef.current, {
        height: window.innerHeight,
        width: window.innerWidth,
        backgroundColor: 'white',
        isDrawingMode: true,
      });

      setCanvas(newCanvas);

      return () => {
        newCanvas.dispose();
       
      };
    }, []);

    useEffect(() => {
      if (!canvas) return;
      
      const handleObjectAdded = (e : any) => {
        if(!e.target) return;

        layerProps.updateLayers(e);
        historyProps.saveToHistory(e.target);

      };

      canvas.on('object:added', handleObjectAdded);

      return () => canvas.off('object:added', handleObjectAdded);
    }, [canvas, layerProps.updateLayers, historyProps.saveToHistory]);

  
    const handleClearCanvas = () => {
      console.log("Clear button clicked");
      if (!canvas) return;
      canvas.clear();
    }

    const handleToggleDrawing = () => {
    
      if (!canvas) return;
      canvas.isDrawingMode = !canvas.isDrawingMode;
      setDrawingModeOn(!drawingModeOn);
    }

  useEffect(() => {
    const handleKeyDown = (e : KeyboardEvent) => {
      if(e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        if(e.shiftKey){
          historyProps.undo();
       }
       else{
          historyProps.redo();
       }
      }
    };

    const resizeWindow = (e : UIEvent) => {
      if (!canvas) return;
      canvas.setDimensions({
        height: window.innerHeight,
        width: window.innerWidth,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', resizeWindow);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', resizeWindow);
    };

  }, [historyProps]);


   return(
      <>
      <ToolBar
        {...brushProps}
        drawingModeOn={drawingModeOn}
        handleUndo={historyProps.undo}
        handleRedo={historyProps.redo}
        handleToggleDrawing={handleToggleDrawing}
        handleClearCanvas={handleClearCanvas}
        handleErase={brushProps.handleErase}
        isEyedropperActive={eyeDropperProps.isEyeDropperActive}
        handleEyedropperTool={eyeDropperProps.handleEyeDropperTool}
        setShapeType={shapeProps.setShapeType}
        setShapeProps={shapeProps.setShapeProps}
        setTextProps={textProps.setTextProps}
        shapeType={shapeProps.shapeType}
        shapeProps={shapeProps.shapeProps}
        textProps={textProps.textProps}
        fillShape={shapeProps.fillShape}
        setFillShape={shapeProps.setFillShape}
        createSelectedShape={shapeProps.createSelectedShape}
        activateTextTool={textProps.activateTextTool}
        deactivateTextTool={textProps.deactivateTextTool}
        deactivateShapeTool={shapeProps.deactivateShapeTool}
        activateShapeTool={shapeProps.activateShapeTool}
      />

      <LayerPanel {...layerProps} />
      <ColorPicker color={brushProps.color} onColorChange={brushProps.setColor} />

      <canvas
        ref={canvasRef}
        className="absolute border border-indigo-600 mt-10"
      />
    </>
   );
}

export default FCanvas