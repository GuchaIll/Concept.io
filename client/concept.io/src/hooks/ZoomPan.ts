import { useState, useCallback, useEffect } from 'react';
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
    console.log('Pan start event:', { isPanToolActive });
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
    canvas.selection = false;
    canvas.defaultCursor = 'grabbing';
    canvas.hoverCursor = 'grabbing';
  }, [canvas, isPanToolActive]);

  const handlePanMove = useCallback((opt: fabric.TEvent<MouseEvent | TouchEvent>) => {
    if (!canvas || !isPanning) return;
    const evt = opt.e;

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

    // Update viewport transform directly
    vpt[4] += clientX - lastPosX;
    vpt[5] += clientY - lastPosY;

    canvas.requestRenderAll();
    setLastPosX(clientX);
    setLastPosY(clientY);
  }, [canvas, isPanning, lastPosX, lastPosY]);

  const handlePanEnd = useCallback(() => {
    if (!canvas) return;
    
    setIsPanning(false);
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
  }, [canvas]);

  const resetView = useCallback(() => {
    if (!canvas) return;
    
    // Reset to identity transform
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoomLevel(1);
    canvas.requestRenderAll();
  }, [canvas]);

  // Effect to update canvas state when pan tool is activated/deactivated
  useEffect(() => {
    if (!canvas) return;
    
    if (isPanToolActive) {
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      canvas.selection = false;
      canvas.isDrawingMode = false;
    } else {
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.selection = true;
      canvas.isDrawingMode = false;
      setIsPanning(false);
    }
  }, [canvas, isPanToolActive]);

  // Effect to handle zoom and pan events
  useEffect(() => {
    if (!canvas) return;

    // Always enable zoom
    canvas.on('mouse:wheel', handleZoom);
    
    // Only set up pan handlers if pan tool is active
    if (isPanToolActive) {
      canvas.on('mouse:down', handlePanStart);
      canvas.on('mouse:move', handlePanMove);
      canvas.on('mouse:up', handlePanEnd);
      canvas.on('mouse:out', handlePanEnd);
    }

    return () => {
      canvas.off('mouse:wheel', handleZoom);
      if (isPanToolActive) {
        canvas.off('mouse:down', handlePanStart);
        canvas.off('mouse:move', handlePanMove);
        canvas.off('mouse:up', handlePanEnd);
        canvas.off('mouse:out', handlePanEnd);
      }
    };
  }, [canvas, isPanToolActive, handleZoom, handlePanStart, handlePanMove, handlePanEnd]);

  return {
    zoomLevel,
    isPanning,
    isPanToolActive,
    resetView
  };
};