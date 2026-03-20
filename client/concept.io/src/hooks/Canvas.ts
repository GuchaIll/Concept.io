import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { useTool } from '../contexts/ToolContext';
import { useHistory } from './History';
import { useLayers } from './Layer';
import { useEraser } from './Eraser';
import { useEyeDropper } from './EyeDropper';
import {useBrush} from './Brush';
// import { useBrushContext } from '../contexts/BrushContext';
import { useFill } from './Fill';
import { useSelection } from './Selection';
import { isToolAllowed, getBlockedToolMessage } from '../config/layerConstraints';
import { useToast } from '../components/Toast';

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
    _repositioning?: boolean;
    _skipHistory?: boolean;
  }
}

export const useCanvas = (config?: CanvasConfig) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const { state: toolState } = useTool();
  const history = useHistory(canvas);
  const layer = useLayers(canvas);
  const { EraseModeOn, toggleEraseMode } = useEraser(canvas);
  const brushProps = useBrush(canvas);
  const toast = useToast();
  
  // Only enable selection when select tool is active
  const isSelectToolActive = toolState.activeToolId === 'select';
  const selection = useSelection(canvas, isSelectToolActive);
  
  // Initialize eyedropper with color callback
  useEyeDropper(canvas, {
    onColorPicked: (color) => {
      brushProps.handleColorChange(color);
    }
  });

  // Stable ref so the selection handler always sees the current tool without
  // re-registering canvas event listeners on every tool change.
  const activeToolRef = useRef(toolState.activeToolId);
  useEffect(() => {
    activeToolRef.current = toolState.activeToolId;
  }, [toolState.activeToolId]);

  // When the user explicitly selects a canvas image with the select tool,
  // sample its average colour and set it as the active brush colour.
  // Gated on the select tool so that programmatic setActiveObject calls
  // (e.g. from addAssetLayer) never clobber the current brush colour.
  useEffect(() => {
    if (!canvas) return;

    const sampleImageColor = (obj: fabric.FabricObject) => {
      if (obj.type !== 'image') return;
      // Only sample when the user is actively using the select tool —
      // prevents addAssetLayer's programmatic setActiveObject from
      // replacing the brush colour with the image's average colour.
      if (activeToolRef.current !== 'select') return;
      try {
        const imgEl = (obj as fabric.FabricImage).getElement() as HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
        const tmp = document.createElement('canvas');
        tmp.width = 16;
        tmp.height = 16;
        const ctx = tmp.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(imgEl, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 16) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2];
          count++;
        }
        if (count === 0) return;
        brushProps.handleColorChange({
          r: Math.round(r / count),
          g: Math.round(g / count),
          b: Math.round(b / count),
          a: 1,
        });
      } catch {
        // Cross-origin or tainted canvas — silently ignore
      }
    };

    const onSelectionCreated = (e: { selected: fabric.FabricObject[] }) => {
      const active = e.selected?.[0] ?? canvas.getActiveObject();
      if (active) sampleImageColor(active);
    };
    const onSelectionUpdated = (e: { selected: fabric.FabricObject[] }) => {
      const active = e.selected?.[0] ?? canvas.getActiveObject();
      if (active) sampleImageColor(active);
    };

    canvas.on('selection:created', onSelectionCreated);
    canvas.on('selection:updated', onSelectionUpdated);
    return () => {
      canvas.off('selection:created', onSelectionCreated);
      canvas.off('selection:updated', onSelectionUpdated);
    };
  }, [canvas, brushProps.handleColorChange]);

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

  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(1);
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 10;

  // Calculate initial canvas dimensions (centered with margins from UI)
  // This is only for the initial canvas size - when zooming, canvas can expand beyond these bounds
  const getInitialCanvasDimensions = useCallback(() => {
    const marginLeft = 90;    // Space for left tool rail
    const marginRight = 300;  // Space for right layers panel
    const marginTop = 80;     // Space for top bar
    const marginBottom = 100; // Space for bottom action bar
    
    // Initial canvas size fits within the margins
    return {
      width: Math.max(400, window.innerWidth - marginLeft - marginRight - 40), // Extra padding
      height: Math.max(300, window.innerHeight - marginTop - marginBottom - 40)
    };
  }, []);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPosition = useRef<{ x: number; y: number } | null>(null);

  // Handle mouse wheel zoom - like Procreate, zoom allows canvas to expand under/beyond UI
  const handleMouseWheel = useCallback((opt: any) => {
    if (!canvas) return;

    const e = opt.e as WheelEvent;

    // Normalise deltaY: trackpads send tiny floats, mice send ~100/notch.
    // Using a linear scale avoids the exponential drift of `0.998 ** delta`.
    const ZOOM_SPEED = 0.0008;
    const rawFactor = 1 - e.deltaY * ZOOM_SPEED;
    const clampedFactor = Math.max(0.8, Math.min(1.25, rawFactor)); // cap per-event step
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.getZoom() * clampedFactor));

    // zoomToPoint expects canvas-element pixel coords, NOT scene coords.
    // getScenePoint() applies the inverse viewport transform, giving the wrong
    // pivot when the canvas is panned or already zoomed.
    const el = canvas.getElement() as HTMLCanvasElement;
    const rect = el.getBoundingClientRect();
    const pointer = new fabric.Point(e.clientX - rect.left, e.clientY - rect.top);

    canvas.zoomToPoint(pointer, zoom);
    setZoomLevel(zoom);

    e.preventDefault();
    e.stopPropagation();
  }, [canvas]);

  // Handle panning with middle mouse button or when in pan mode
  const handleMouseDown = useCallback((opt: any) => {
    if (!canvas) return;
    
    const e = opt.e as MouseEvent;
    // Middle mouse button (button === 1) or space key held for panning
    if (e.button === 1 || (e.altKey && e.button === 0)) {
      setIsPanning(true);
      lastPanPosition.current = { x: e.clientX, y: e.clientY };
      canvas.selection = false;
      canvas.defaultCursor = 'grabbing';
      canvas.setCursor('grabbing');
      e.preventDefault();
    }
  }, [canvas]);

  const handleMouseMove = useCallback((opt: any) => {
    if (!canvas || !isPanning || !lastPanPosition.current) return;
    
    const e = opt.e as MouseEvent;
    const vpt = canvas.viewportTransform;
    if (!vpt) return;
    
    // Calculate movement delta
    const deltaX = e.clientX - lastPanPosition.current.x;
    const deltaY = e.clientY - lastPanPosition.current.y;
    
    // Update viewport transform for panning
    vpt[4] += deltaX;
    vpt[5] += deltaY;
    
    canvas.setViewportTransform(vpt);
    lastPanPosition.current = { x: e.clientX, y: e.clientY };
    
    e.preventDefault();
  }, [canvas, isPanning]);

  const handleMouseUp = useCallback(() => {
    if (!canvas) return;
    
    if (isPanning) {
      setIsPanning(false);
      lastPanPosition.current = null;
      canvas.selection = true;
      canvas.defaultCursor = 'default';
    }
  }, [canvas, isPanning]);

  // Zoom controls for programmatic use
  const zoomIn = useCallback(() => {
    if (!canvas) return;
    let zoom = canvas.getZoom() * 1.2;
    if (zoom > MAX_ZOOM) zoom = MAX_ZOOM;
    
    // Zoom to center
    const center = canvas.getCenterPoint();
    canvas.zoomToPoint(center, zoom);
    setZoomLevel(zoom);
  }, [canvas]);

  const zoomOut = useCallback(() => {
    if (!canvas) return;
    let zoom = canvas.getZoom() / 1.2;
    if (zoom < MIN_ZOOM) zoom = MIN_ZOOM;
    
    // Zoom to center
    const center = canvas.getCenterPoint();
    canvas.zoomToPoint(center, zoom);
    setZoomLevel(zoom);
  }, [canvas]);

  // Compute the zoom that fits the canvas inside the available viewport area.
  // Called on init and on reset so the user always sees the whole canvas.
  const fitToView = useCallback((c: fabric.Canvas) => {
    const marginLeft = 90, marginRight = 300, marginTop = 80, marginBottom = 100;
    const availW = window.innerWidth  - marginLeft - marginRight - 40;
    const availH = window.innerHeight - marginTop  - marginBottom - 40;
    const fitZoom = Math.min(
      availW / (c.width  ?? availW),
      availH / (c.height ?? availH),
      1, // never start more zoomed-in than 100 %
    );
    const zoom = Math.max(MIN_ZOOM, fitZoom);
    c.setZoom(zoom);
    c.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
    return zoom;
  }, []);

  const resetZoom = useCallback(() => {
    if (!canvas) return;
    const zoom = fitToView(canvas);
    setZoomLevel(zoom);
  }, [canvas, fitToView]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const dimensions = getInitialCanvasDimensions();
    
    // If a Fabric canvas already exists on this element, dispose it
    const newCanvas = new fabric.Canvas(canvasRef.current, {
      width: dimensions.width,
      height: dimensions.height,
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

    // Start at fit-to-view so the canvas is never clipped on first load
    const initialZoom = fitToView(newCanvas);
    setZoomLevel(initialZoom);

    setCanvas(newCanvas);

    return () => {
      newCanvas.dispose();
    };
  }, []);


  const handleResize = useCallback(() => {
    if (!canvas) return;
    
    // On resize, recalculate initial dimensions but preserve zoom level
    const dimensions = getInitialCanvasDimensions();
    canvas.setDimensions(dimensions);
    canvas.requestRenderAll();
  }, [canvas, getInitialCanvasDimensions]);

  const handleKeyEvents = useCallback((e: KeyboardEvent) => {
    if (!canvas) return;

    // Handle undo/redo: Ctrl+Z for undo, Ctrl+Shift+Z for redo
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) {
        // Ctrl+Shift+Z = Redo
        history.redo();
        console.log('Redo triggered');
      } else {
        // Ctrl+Z = Undo
        history.undo();
        console.log('Undo triggered');
      }
    }
    
    // Also support Ctrl+Y for redo (Windows standard)
    if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      history.redo();
      console.log('Redo triggered (Ctrl+Y)');
    }

    // Handle delete — skip if a text input/editable element has focus
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const activeObj = canvas.getActiveObject();
      if (activeObj && (activeObj as any).isEditing) return;
      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.length) {
        activeObjects.forEach(obj => canvas.remove(obj));
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    }
  }, [canvas, history]);

  // Use refs to avoid recreating callbacks when layer/history changes
  const layerRef = useRef(layer);
  const historyRef = useRef(history);
  
  useEffect(() => {
    layerRef.current = layer;
  }, [layer]);
  
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const handleObjectAdded = useCallback((e: any) => {
    if (!e.target) return;
    
    // Skip if this is a restored object from redo (to prevent double-saving)
    if (e.target._skipHistory) {
      delete e.target._skipHistory;
      return;
    }
    
    // Update layers using ref to avoid dependency on layer
    layerRef.current.updateLayers?.(e);
    layerRef.current.refreshLayerThumbnailForObject?.(e.target);
    
    // Save to history using ref - only save on add, not on modify
    historyRef.current.saveToHistory(e.target);
  }, []);

  const handleObjectModified = useCallback((e: any) => {
    if (!e.target) return;
    
    // Update layers only - don't save to history here to avoid duplicates
    layerRef.current.updateLayers(e);
    layerRef.current.refreshLayerThumbnailForObject?.(e.target);
  }, []);

  const handleObjectRemoved = useCallback((e: any) => {
    if (!e.target) return;
    
    // Update layers only - history is managed by undo/redo functions
    layerRef.current.updateLayers(e);
    layerRef.current.refreshLayerThumbnailForObject?.(e.target);
  }, []);

  useEffect(() => {
    if (!canvas) return;

    // Set up event listeners
    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:removed', handleObjectRemoved);
    canvas.on('mouse:wheel', handleMouseWheel);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyEvents);

    return () => {
      canvas.off('object:added', handleObjectAdded);
      canvas.off('object:modified', handleObjectModified);
      canvas.off('object:removed', handleObjectRemoved);
      canvas.off('mouse:wheel', handleMouseWheel);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyEvents);
    };
  }, [canvas, handleResize, handleKeyEvents, handleMouseWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleObjectAdded, handleObjectModified, handleObjectRemoved]);

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
      case 'select':
        newState = {
          isDrawingMode: false,
          selection: true,
          defaultCursor: 'default'
        };
        break;
      case 'Eyedropper':
        newState = {
          isDrawingMode: false,
          selection: false,
          defaultCursor: 'crosshair'
        };
        break;
      case 'eraser': {
        // Proactive layer constraint check — block eraser if layer doesn't allow drawing
        const activeLayerE = layer.activeLayer;
        const eraserAllowed = isToolAllowed('eraser', activeLayerE.type, activeLayerE.locked);
        if (!eraserAllowed) {
          const msg = getBlockedToolMessage('eraser', activeLayerE.type, activeLayerE.locked);
          if (msg) toast.addToast(msg, 'warning');
          newState = {
            isDrawingMode: false,
            selection: false,
            defaultCursor: 'not-allowed'
          };
        } else {
          newState = {
            isDrawingMode: true,
            selection: false,
            defaultCursor: 'crosshair'
          };
        }
        break;
      }
      case 'Fill':
      case 'shape':
        newState = {
          isDrawingMode: false,
          selection: false,
          defaultCursor: 'crosshair'
        };
        break;
      case 'brush': {
        // Proactive layer constraint check — block brush if layer doesn't allow drawing
        const activeLayer = layer.activeLayer;
        const brushAllowed = isToolAllowed('brush', activeLayer.type, activeLayer.locked);
        if (!brushAllowed) {
          const msg = getBlockedToolMessage('brush', activeLayer.type, activeLayer.locked);
          if (msg) toast.addToast(msg, 'warning');
          newState = {
            isDrawingMode: false,
            selection: false,
            defaultCursor: 'not-allowed'
          };
        } else {
          newState = {
            isDrawingMode: true,
            selection: false,
            defaultCursor: 'crosshair'
          };
        }
        break;
      }
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
      case 'generate':
      case 'asset':
        newState = {
          isDrawingMode: false,
          selection: true,
          defaultCursor: 'default'
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
  // layer.activeLayer is React state — its reference only changes when setActiveLayer
  // is called, so adding it here is safe and ensures constraints are re-evaluated
  // whenever the user switches layers (not just when the tool changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, toolState.activeToolId, EraseModeOn, toggleEraseMode, layer.activeLayer]);

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
    brushProps,
    selection,
    toast,
    // Zoom controls
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom
  };
};
