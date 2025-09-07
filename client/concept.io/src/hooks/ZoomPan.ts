import { useState, useCallback } from 'react';
import * as fabric from 'fabric';

export const useZoomPan = (canvas: fabric.Canvas | null) => {
  const [isPanning, setIsPanning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [lastPosX, setLastPosX] = useState(0);
  const [lastPosY, setLastPosY] = useState(0);

  const activatePanMode = useCallback(() => {
    if (!canvas) return;
    console.log("Pan mode activated");
    setIsPanning(true);
    canvas.defaultCursor = 'grab';
    canvas.hoverCursor = 'grab';
    canvas.selection = false;
    canvas.isDrawingMode = false;
  }, [canvas]);

  const deactivatePanMode = useCallback(() => {
    if (!canvas) return;
    console.log("Pan mode deactivated");  
    setIsPanning(false);
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.isDrawingMode = true;

    canvas.off('mouse:down', (opt) => handleMouseDragStart(opt));
    canvas.off('mouse:move', (opt) => handleMouseDragMove(opt));
    canvas.off('mouse:up', (opt) => handleMouseRelease(opt));
  }, [canvas]);

  const handleMouseDragStart = useCallback((opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
    if (!canvas || !isPanning) return;
    const point = opt.scenePoint;
    canvas.defaultCursor = 'grabbing';
    canvas.hoverCursor = 'grabbing';
    setLastPosX(point.x);
    setLastPosY(point.y);
  }, [canvas, isPanning]);

  const handleMouseDragMove = useCallback((opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
    if (!canvas) return;
    if (!isPanning) return;
    // Only proceed if left mouse button is pressed or it's a touch event
    if (opt.e && 'buttons' in opt.e && opt.e.buttons !== 1 && !(opt.e instanceof TouchEvent)) return;

      const point = opt.scenePoint;
      const deltaX = point.x - lastPosX;
      const deltaY = point.y - lastPosY;

      const delta = new fabric.Point(deltaX, deltaY);
      canvas.relativePan(delta);

      setLastPosX(point.x);
      setLastPosY(point.y);
    }, [canvas, isPanning, lastPosX, lastPosY]);

  // const translateCanvas = (deltaX: number, deltaY: number) => {
  //   if (!canvas) return;

  //   const transform = getTransformVals(canvas.wrapperEl);

  //   let offsetX = transform.translateX + (event.clientX - (lastPosX || 0));
  //   let offsetY = transform.translateY + (event.clientY - (lastPosY || 0));

  //   canvas.wrapperEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${transform.scaleX})`;
  // } ;


  const handleMouseRelease = useCallback((opt : fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
    if (!canvas || !isPanning) return;
    canvas.defaultCursor = 'grab';
    canvas.hoverCursor = 'grab';
  }, [canvas, isPanning]);

  const handlePanning = useCallback(() => {
    if (!canvas) return;

    canvas.on('mouse:down', (opt) => handleMouseDragStart(opt));

    canvas.on('mouse:move', (opt) => handleMouseDragMove(opt));

    canvas.on('mouse:up', (opt) => handleMouseRelease(opt));
  }, [canvas, isPanning, lastPosX, lastPosY]);



  const zoomToPoint = useCallback((point: fabric.Point, zoom: number) => {
    if (!canvas) return;

    const zoomDelta = zoom / zoomLevel;
    canvas.zoomToPoint(point, zoomDelta);
    setZoomLevel(zoom);
    canvas.requestRenderAll();
  }, [canvas, zoomLevel]);

  const handleZoom = useCallback((opt: WheelEvent) => {
    if (!canvas) return;
    
    opt.preventDefault();
    opt.stopPropagation();

    const delta = opt.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    
    if (zoom > 20) zoom = 20;
    if (zoom < 0.01) zoom = 0.01;

    const point = new fabric.Point(opt.offsetX, opt.offsetY);
    zoomToPoint(point, zoom);
  }, [canvas, zoomToPoint]);

  const resetZoomPan = useCallback(() => {
    if (!canvas) return;
    
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoomLevel(1);
    canvas.requestRenderAll();
  }, [canvas]);

  return {
    isPanning,
    zoomLevel,
    activatePanMode,
    deactivatePanMode,
    handlePanning,
    handleZoom,
    resetZoomPan
  };
};