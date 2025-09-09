import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { useTool } from '../contexts/ToolContext';
import { useHistory } from './History';
import { useLayers } from './Layer';

export interface CanvasConfig {
  width?: number;
  height?: number; 
  backgroundColor?: string;
}

declare module 'fabric' {
  export interface FabricObject {
    id?: string;
    layerId?: string;
    baseOpacity?: number;
  }
}

export const useCanvas = (config?: CanvasConfig) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const { state: toolState } = useTool();
  const history = useHistory(canvas);
  const layer = useLayers(canvas);


  useEffect(() => {
  if (!canvasRef.current) return;

  // If a Fabric canvas already exists on this element, dispose it
  

  const newCanvas = new fabric.Canvas(canvasRef.current, {
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "white",
    preserveObjectStacking: true,
    enableRetinaScaling: true,
    selection: true,
  });

  // attach reference to DOM element so we know it's been initialized

  setCanvas(newCanvas);

  return () => {
    newCanvas.dispose();
  };
}, []);


  const handleResize = useCallback(() => {
    if (!canvas) return;
    
    canvas.setDimensions({
      width: window.innerWidth,
      height: window.innerHeight
    });
    canvas.requestRenderAll();
  }, [canvas]);

  const handleKeyEvents = useCallback((e: KeyboardEvent) => {
    if (!canvas) return;

    // Handle undo/redo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      if (e.shiftKey) {
        history.undo();
      } else {
        history.redo();
      }
    }

    // Handle delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.length) {
        activeObjects.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
  }, [canvas, history]);

  const handleObjectAdded = useCallback((e: any) => {
    if (!e.target) return;
    
    // Update layers
    layer.updateLayers(e);
    
    // Save to history
    history.saveToHistory(e.target);
  }, [layer, history]);



  useEffect(() => {
    if (!canvas) return;

    // Set up event listeners
    canvas.on('object:added', handleObjectAdded);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyEvents);

    return () => {
      canvas.off('object:added', handleObjectAdded);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyEvents);
    };
  }, [canvas, handleObjectAdded, handleResize, handleKeyEvents]);

  // Update canvas based on active tool
  useEffect(() => {
    if (!canvas || !toolState.activeTool) return;

    switch (toolState.activeToolId) {
      case 'brush':
        canvas.isDrawingMode = true;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        break;
      case 'pan':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        break;
      case 'text':
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'text';
        break;
      case 'shape':
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'crosshair';
        break;
      default:
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
    }
  }, [canvas, toolState.activeToolId]);

  const clearCanvas = useCallback(() => {
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = config?.backgroundColor || 'white';
    canvas.requestRenderAll();
  }, [canvas, config]);

  const getCanvasImage = useCallback(() => {
    if (!canvas) return null;
    return canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 2
    });
  }, [canvas]);

  return {
    canvas,
    setCanvas,
    canvasRef,
    clearCanvas,
    getCanvasImage,
    history,
    layer
  };
};