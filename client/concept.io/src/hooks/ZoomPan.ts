import { useState, useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useTool } from '../contexts/ToolContext';

export const useZoomPan = (canvas: fabric.Canvas | null) => {
  const { state: toolState } = useTool();
  const isPanToolActive = toolState.activeToolId === 'pan';
  
  const [isPanning, setIsPanning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [lastPosX, setLastPosX] = useState(0);
  const [lastPosY, setLastPosY] = useState(0);

  const handleZoom = useCallback((opt: fabric.TEvent<WheelEvent>) => {
    if (!canvas) return;
    const evt = opt.e;
    
    console.log('Zoom event:', { deltaY: evt.deltaY, currentZoom: canvas.getZoom() });
    
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** evt.deltaY; // Smooth zoom

    // Limit zoom range
    zoom = Math.min(Math.max(0.5, zoom), 5);

    // Zoom to point under cursor
    canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);
    setZoomLevel(zoom);
    
    evt.preventDefault();
    evt.stopPropagation();
  }, [canvas]);

  const handlePanStart = useCallback((opt: fabric.TEvent<MouseEvent | TouchEvent>) => {
    if (!canvas || !isPanToolActive) return;
    const evt = opt.e;
    
    // Skip if not using left mouse button
    if (evt instanceof MouseEvent && evt.buttons !== 1) return;

    let clientX: number, clientY: number;
    if (evt instanceof MouseEvent) {
      clientX = evt.clientX;
      clientY = evt.clientY;
    } else if (evt instanceof TouchEvent && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      return;
    }

    setLastPosX(clientX);
    setLastPosY(clientY);
    setIsPanning(true);

    // Update cursor only while actively panning
    canvas.defaultCursor = 'grabbing';
    canvas.hoverCursor = 'grabbing';
  }, [canvas, isPanToolActive]);

  // Ref to store the last animation frame request
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateTimeRef = useRef<number>(0);
  const FRAME_RATE = 60; // Limit to 60 FPS
  const FRAME_INTERVAL = 1000 / FRAME_RATE;

  const handlePanMove = useCallback((opt: fabric.TEvent<MouseEvent | TouchEvent>) => {
    if (!canvas || !isPanToolActive || !isPanning) return;
    const evt = opt.e;

    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Get current time
    const currentTime = Date.now();
    
    // If we haven't waited long enough since the last update, schedule next frame
    if (currentTime - lastUpdateTimeRef.current < FRAME_INTERVAL) {
      animationFrameRef.current = requestAnimationFrame(() => handlePanMove(opt));
      return;
    }

    let clientX: number, clientY: number;
    if (evt instanceof MouseEvent) {
      clientX = evt.clientX;
      clientY = evt.clientY;
    } else if (evt instanceof TouchEvent && evt.touches.length > 0) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      return;
    }

    const vpt = canvas.viewportTransform;
    if (!vpt) return;

    // Calculate the new position
    const deltaX = clientX - lastPosX;
    const deltaY = clientY - lastPosY;

    // Update viewport transform
    vpt[4] += deltaX;
    vpt[5] += deltaY;

    // Use setTransform instead of directly modifying vpt
    canvas.setViewportTransform(vpt);

    // Update last position and time
    setLastPosX(clientX);
    setLastPosY(clientY);
    lastUpdateTimeRef.current = currentTime;
  }, [canvas, isPanToolActive, isPanning, lastPosX, lastPosY]);

  const handlePanEnd = useCallback(() => {
    if (!canvas) return;
    
    setIsPanning(false);

    // Reset cursor to grab if still in pan mode, otherwise default
    if (isPanToolActive) {
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
    } else {
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
    }
  }, [canvas]);

  const resetView = useCallback(() => {
    if (!canvas) return;
    
    // Reset to identity transform
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoomLevel(1);
    canvas.requestRenderAll();
  }, [canvas]);

  // Effect to update canvas state when pan tool is activated/deactivated
  // Effect to handle tool state changes
  useEffect(() => {
    if (!canvas) return;

    console.log('Tool state changed:', { isPanToolActive });
    // Cancel any ongoing pan animation when changing tools
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (isPanToolActive) {
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      canvas.selection = false;
      canvas.isDrawingMode = false;
    } else {
      setIsPanning(false); // Reset panning state when switching tools
    }

    // Reset state
    setLastPosX(0);
    setLastPosY(0);
    lastUpdateTimeRef.current = 0;
  }, [canvas, isPanToolActive]);

  // Effect to handle zoom and pan events
  useEffect(() => {
    if (!canvas) return;

    const zoomHandler = handleZoom;
    const panStartHandler = handlePanStart;
    const panMoveHandler = handlePanMove;
    const panEndHandler = handlePanEnd;

    // Always enable zoom
    canvas.on('mouse:wheel', zoomHandler);
    
    // Always set up pan handlers, but they'll only work when pan tool is active
    canvas.on('mouse:down', panStartHandler);
    canvas.on('mouse:move', panMoveHandler);
    canvas.on('mouse:up', panEndHandler);
    canvas.on('mouse:out', panEndHandler);

    return () => {
      // Clean up event handlers
      canvas.off('mouse:wheel', zoomHandler);
      canvas.off('mouse:down', panStartHandler);
      canvas.off('mouse:move', panMoveHandler);
      canvas.off('mouse:up', panEndHandler);
      canvas.off('mouse:out', panEndHandler);

      // Cancel any ongoing animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }

      // Reset all state
      setIsPanning(false);
      setLastPosX(0);
      setLastPosY(0);
      lastUpdateTimeRef.current = 0;
    };
  }, [canvas, handleZoom, handlePanStart, handlePanMove, handlePanEnd]);

  return {
    zoomLevel,
    isPanning,
    isPanToolActive,
    resetView
  };
};