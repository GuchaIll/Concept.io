import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { useTool } from '../contexts/ToolContext';
import { useHistory } from './History';
import { useLayers } from './Layer';
import { useEraser } from './Eraser';
import { useEyeDropper } from './EyeDropper';
import { useBrush } from './Brush';
import { useFill } from './Fill';

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
  const { EraseModeOn, toggleEraseMode } = useEraser(canvas);
  
  // Initialize brush with current tool state
  const brushProps = useBrush(canvas);
  
  // Initialize eyedropper with color callback
  useEyeDropper(canvas, {
    onColorPicked: (color) => {
      brushProps.handleColorChange(color);
    }
  });

  // When tool changes from eyedropper to another tool, restore previous color
  useEffect(() => {
    const wasUsingEyedropper = brushProps.previousTool === 'Eyedropper';
    const isNotUsingEyedropper = toolState.activeToolId !== 'Eyedropper';

    if (wasUsingEyedropper && isNotUsingEyedropper) {
      brushProps.restorePreviousColor();
    }

    // Track the current tool for next change
    brushProps.setPreviousTool(toolState.activeToolId);
  }, [toolState.activeToolId]);

  useFill(canvas, brushProps.color);



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
      renderOnAddRemove: true,
      fireRightClick: true,
      stopContextMenu: true
    });

    // Enable proper event handling
    newCanvas.wrapperEl?.setAttribute('tabindex', '1');
    newCanvas.wrapperEl?.focus();

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
    if (!canvas) return;

    const currentTool = toolState.activeToolId;
    
    // Handle eraser mode
    if (currentTool !== 'eraser' && EraseModeOn) {
      toggleEraseMode();
    } else if (currentTool === 'eraser' && !EraseModeOn) {
      toggleEraseMode();
    }

    // Default state
    let newState = {
      isDrawingMode: false,
      selection: true,
      defaultCursor: 'default'
    };

    // Tool-specific states
    switch (currentTool) {
      case 'Eyedropper':
        newState = {
          isDrawingMode: false,
          selection: false,
          defaultCursor: 'crosshair'
        };
        break;
      case 'eraser':
        newState = {
          isDrawingMode: true,
          selection: false,
          defaultCursor: 'crosshair'
        };
        
        break;
      case 'Fill':
      case 'shape':
        newState = {
          isDrawingMode: false,
          selection: false,
          defaultCursor: 'crosshair'
        };
        break;
      case 'brush':
        newState = {
          isDrawingMode: true,
          selection: false,
          defaultCursor: 'crosshair'
        };
        break;
      case 'pan':
        newState = {
          isDrawingMode: false,
          selection: false,
          defaultCursor: 'grab'
        };
        break;
      case 'text':
        newState = {
          isDrawingMode: false,
          selection: true,
          defaultCursor: 'text'
        };
        break;
    }

    // Apply new state
    canvas.isDrawingMode = newState.isDrawingMode;
    canvas.selection = newState.selection;
    canvas.defaultCursor = newState.defaultCursor;
    
    // Set hover cursor based on tool
    switch (currentTool) {
      case 'Eyedropper':
      case 'Fill':
      case 'eraser':
        canvas.hoverCursor = 'crosshair'; // Keep crosshair when hovering objects
        break;
      case 'pan':
        canvas.hoverCursor = 'grab';
        break;
      case 'text':
        canvas.hoverCursor = 'text';
        break;
      default:
        canvas.hoverCursor = newState.selection ? 'move' : newState.defaultCursor;
    }

    canvas.requestRenderAll();
  }, [canvas, toolState.activeToolId, EraseModeOn, toggleEraseMode]);

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
    layer,
    isErasing: EraseModeOn,
    toggleEraser: toggleEraseMode,
    brushProps
  };
};