import { useState, useCallback, useEffect, useRef } from 'react';
import * as fabric from 'fabric';

export type SelectionMode = 'box' | 'lasso' | 'magic';

export type SelectionAction = 'transform' | 'edit' | 'liquify' | 'effects' | 'generate' | 'append';

interface SelectionBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SelectionState {
  mode: SelectionMode;
  magicThreshold: number;
  isSelecting: boolean;
  hasSelection: boolean;
  hasObjectsSelected: boolean;
  selectionBounds: SelectionBounds | null;
  activeAction: SelectionAction;
}

export const useSelection = (canvas: fabric.Canvas | null, isToolActive: boolean = false) => {
  const [state, setState] = useState<SelectionState>({
    mode: 'box',
    magicThreshold: 30,
    isSelecting: false,
    hasSelection: false,
    hasObjectsSelected: false,
    selectionBounds: null,
    activeAction: 'transform',
  });

  const lassoPoints = useRef<{ x: number; y: number }[]>([]);
  const lassoPath = useRef<fabric.Path | null>(null);
  const selectionRect = useRef<fabric.Rect | null>(null);
  const boxStartPoint = useRef<{ x: number; y: number } | null>(null);

  // Clear selection visuals - defined first as it's used by other functions
  const clearSelectionVisuals = useCallback(() => {
    if (canvas && selectionRect.current) {
      canvas.remove(selectionRect.current);
      selectionRect.current = null;
    }
    if (canvas && lassoPath.current) {
      canvas.remove(lassoPath.current);
      lassoPath.current = null;
    }
    lassoPoints.current = [];
    boxStartPoint.current = null;
    setState(prev => ({
      ...prev,
      hasSelection: false,
      selectionBounds: null,
    }));
  }, [canvas]);

  // Clear selection (both visual and objects)
  const clearSelection = useCallback(() => {
    if (canvas) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
    clearSelectionVisuals();
    setState(prev => ({
      ...prev,
      hasSelection: false,
      hasObjectsSelected: false,
      selectionBounds: null,
    }));
  }, [canvas, clearSelectionVisuals]);

  // Set selection mode
  const setMode = useCallback((mode: SelectionMode) => {
    setState(prev => ({ ...prev, mode }));
    // Clear any existing selection visuals when changing modes
    clearSelectionVisuals();
  }, [clearSelectionVisuals]);

  // Set magic select threshold
  const setMagicThreshold = useCallback((threshold: number) => {
    setState(prev => ({ ...prev, magicThreshold: threshold }));
  }, []);

  // Set active action
  const setActiveAction = useCallback((action: SelectionAction) => {
    setState(prev => ({ ...prev, activeAction: action }));
  }, []);

  // Clear selection when tool becomes inactive
  useEffect(() => {
    if (!isToolActive) {
      clearSelectionVisuals();
    }
  }, [isToolActive, clearSelectionVisuals]);

  // Sync with Fabric's built-in object selection (click-to-select, shift-click, etc.)
  useEffect(() => {
    if (!canvas || !isToolActive) return;

    const syncFromFabric = () => {
      const active = canvas.getActiveObject();
      if (!active) return;
      const br = active.getBoundingRect();
      setState(prev => ({
        ...prev,
        hasSelection: true,
        hasObjectsSelected: true,
        selectionBounds: { left: br.left, top: br.top, width: br.width, height: br.height },
        activeAction: 'transform',
      }));
    };

    const handleCleared = () => {
      // Only clear if we're not in the middle of our own selection flow
      if (!selectionRect.current && lassoPoints.current.length === 0) {
        setState(prev => ({
          ...prev,
          hasSelection: false,
          hasObjectsSelected: false,
          selectionBounds: null,
        }));
      }
    };

    canvas.on('selection:created', syncFromFabric);
    canvas.on('selection:updated', syncFromFabric);
    canvas.on('selection:cleared', handleCleared);

    return () => {
      canvas.off('selection:created', syncFromFabric);
      canvas.off('selection:updated', syncFromFabric);
      canvas.off('selection:cleared', handleCleared);
    };
  }, [canvas, isToolActive]);

  // Handle box selection with persistent visual rectangle
  useEffect(() => {
    if (!canvas || !isToolActive) return;
    
    if (state.mode === 'box') {
      // Keep Fabric's built-in selection enabled for object manipulation
      canvas.selection = true;
      
      const DRAG_THRESHOLD = 8; // px — must move this far before box-draw starts
      let isPendingDrag = false; // mousedown recorded, waiting for threshold
      let isDrawing = false;
      // Local copy of start point so clearSelectionVisuals() (which nulls the ref) can't break us
      let startX = 0;
      let startY = 0;

      const handleMouseDown = (opt: any) => {
        if (state.mode !== 'box' || !isToolActive) return;

        // Always record the start point regardless of what is under the cursor.
        // Box drawing will begin in handleMouseMove once the drag threshold is exceeded.
        const pointer = canvas.getScenePoint(opt.e);
        startX = pointer.x;
        startY = pointer.y;
        boxStartPoint.current = { x: startX, y: startY };
        isPendingDrag = true;
        isDrawing = false;
      };

      const handleMouseMove = (opt: any) => {
        if (!isPendingDrag) return;

        const pointer = canvas.getScenePoint(opt.e);
        const dx = pointer.x - startX;
        const dy = pointer.y - startY;

        if (!isDrawing) {
          // Check whether we've crossed the drag threshold
          if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

          // Threshold crossed — start box selection unconditionally.
          // Remove any old selection rect manually (don't call clearSelectionVisuals
          // as it nulls boxStartPoint.current and resets state mid-drag).
          if (selectionRect.current) {
            canvas.remove(selectionRect.current);
            selectionRect.current = null;
          }
          canvas.discardActiveObject();
          isDrawing = true;

          selectionRect.current = new fabric.Rect({
            left: startX,
            top: startY,
            width: 0,
            height: 0,
            fill: 'rgba(43, 108, 238, 0.1)',
            stroke: '#2b6cee',
            strokeWidth: 1,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false,
          });
          canvas.add(selectionRect.current);
        }

        if (!selectionRect.current) return;
        selectionRect.current.set({
          left: Math.min(startX, pointer.x),
          top: Math.min(startY, pointer.y),
          width: Math.abs(dx),
          height: Math.abs(dy),
        });
        canvas.requestRenderAll();
      };

      const handleMouseUp = (opt: any) => {
        isPendingDrag = false;

        if (!isDrawing) {
          // Threshold never crossed — treat as a plain click.
          // Re-select the object under cursor so Fabric's normal click-select works.
          if (opt?.e) {
            const target = canvas.findTarget(opt.e);
            if (target && target.selectable) {
              canvas.setActiveObject(target);
              canvas.requestRenderAll();
            }
          }
          return;
        }

        if (!selectionRect.current) return;
        isDrawing = false;
        
        const bounds = {
          left: selectionRect.current.left || 0,
          top: selectionRect.current.top || 0,
          width: selectionRect.current.width || 0,
          height: selectionRect.current.height || 0,
        };
        
        // Only process if selection has meaningful size
        if (bounds.width > 5 && bounds.height > 5) {
          // Find objects within selection bounds
          const objects = canvas.getObjects().filter(obj => {
            if (obj === selectionRect.current || !obj.selectable) return false;
            
            const objBounds = obj.getBoundingRect();
            return (
              objBounds.left >= bounds.left &&
              objBounds.top >= bounds.top &&
              objBounds.left + objBounds.width <= bounds.left + bounds.width &&
              objBounds.top + objBounds.height <= bounds.top + bounds.height
            );
          });
          
          const hasObjects = objects.length > 0;
          
          if (hasObjects) {
            // Select the objects
            if (objects.length === 1) {
              canvas.setActiveObject(objects[0]);
            } else {
              const selection = new fabric.ActiveSelection(objects, { canvas });
              canvas.setActiveObject(selection);
            }
          }
          
          // Keep the selection rectangle visible
          setState(prev => ({
            ...prev,
            hasSelection: true,
            hasObjectsSelected: hasObjects,
            selectionBounds: bounds,
            activeAction: hasObjects ? 'transform' : 'generate',
          }));
          
          canvas.requestRenderAll();
        } else {
          // Selection too small, remove it
          canvas.remove(selectionRect.current);
          selectionRect.current = null;
          boxStartPoint.current = null;
        }
      };

      canvas.on('mouse:down', handleMouseDown);
      canvas.on('mouse:move', handleMouseMove);
      canvas.on('mouse:up', handleMouseUp);

      return () => {
        canvas.off('mouse:down', handleMouseDown);
        canvas.off('mouse:move', handleMouseMove);
        canvas.off('mouse:up', handleMouseUp);
      };
    }
    // Note: Other modes (lasso, magic) handle their own selection settings
  }, [canvas, state.mode, isToolActive, clearSelectionVisuals]);

  // Handle lasso selection
  useEffect(() => {
    if (!canvas || state.mode !== 'lasso' || !isToolActive) return;

    let isDrawing = false;
    
    // Keep selection enabled for object manipulation
    canvas.selection = true;

    const handleMouseDown = (opt: any) => {
      if (state.mode !== 'lasso' || !isToolActive) return;
      
      // Check if clicking on an existing object - if so, let Fabric handle it
      const target = canvas.findTarget(opt.e);
      if (target && target.selectable) {
        // User clicked on a selectable object, don't draw lasso
        return;
      }
      
      // Clear previous selection
      clearSelectionVisuals();
      canvas.discardActiveObject();
      
      isDrawing = true;
      lassoPoints.current = [];
      const pointer = canvas.getScenePoint(opt.e);
      lassoPoints.current.push({ x: pointer.x, y: pointer.y });
      
      // Create initial path
      lassoPath.current = new fabric.Path(`M ${pointer.x} ${pointer.y}`, {
        fill: 'rgba(43, 108, 238, 0.1)',
        stroke: '#2b6cee',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
      });
      canvas.add(lassoPath.current);
    };

    const handleMouseMove = (opt: any) => {
      if (!isDrawing || state.mode !== 'lasso') return;
      
      const pointer = canvas.getScenePoint(opt.e);
      lassoPoints.current.push({ x: pointer.x, y: pointer.y });
      
      // Update path
      if (lassoPath.current && lassoPoints.current.length > 1) {
        const pathData = lassoPoints.current
          .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
          .join(' ') + ' Z';
        
        canvas.remove(lassoPath.current);
        lassoPath.current = new fabric.Path(pathData, {
          fill: 'rgba(43, 108, 238, 0.1)',
          stroke: '#2b6cee',
          strokeWidth: 1,
          strokeDashArray: [5, 5],
          selectable: false,
          evented: false,
        });
        canvas.add(lassoPath.current);
        canvas.requestRenderAll();
      }
    };

    const handleMouseUp = () => {
      if (!isDrawing || state.mode !== 'lasso') return;
      
      isDrawing = false;
      
      // Select objects within lasso
      if (lassoPath.current && lassoPoints.current.length > 2) {
        const objects = canvas.getObjects().filter(obj => {
          if (obj === lassoPath.current || !obj.selectable) return false;
          
          // Check if object center is inside lasso polygon
          const center = obj.getCenterPoint();
          return isPointInPolygon(center, lassoPoints.current);
        });
        
        const hasObjects = objects.length > 0;
        
        if (hasObjects) {
          canvas.discardActiveObject();
          const selection = new fabric.ActiveSelection(objects, { canvas });
          canvas.setActiveObject(selection);
        }
        
        // Calculate bounds from lasso points
        const xs = lassoPoints.current.map(p => p.x);
        const ys = lassoPoints.current.map(p => p.y);
        const bounds = {
          left: Math.min(...xs),
          top: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };
        
        setState(prev => ({
          ...prev,
          hasSelection: true,
          hasObjectsSelected: hasObjects,
          selectionBounds: bounds,
          activeAction: hasObjects ? 'transform' : 'generate',
        }));
        
        // Keep lasso path visible
        canvas.requestRenderAll();
      } else {
        // Remove lasso path if too small
        if (lassoPath.current) {
          canvas.remove(lassoPath.current);
          lassoPath.current = null;
        }
        lassoPoints.current = [];
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      
      // Clean up lasso path if exists
      if (lassoPath.current) {
        canvas.remove(lassoPath.current);
        lassoPath.current = null;
      }
    };
  }, [canvas, state.mode, isToolActive, clearSelectionVisuals]);

  // Magic select - select by color similarity
  const performMagicSelect = useCallback((e: any) => {
    if (!canvas || state.mode !== 'magic' || !isToolActive) return;
    
    const pointer = canvas.getScenePoint(e.e);
    const ctx = canvas.getContext();
    
    // Get pixel color at click point
    const imageData = ctx.getImageData(
      Math.floor(pointer.x),
      Math.floor(pointer.y),
      1,
      1
    );
    const targetColor = {
      r: imageData.data[0],
      g: imageData.data[1],
      b: imageData.data[2],
    };
    
    const threshold = state.magicThreshold / 100;
    
    // Find objects with similar colors
    const objects = canvas.getObjects().filter(obj => {
      if (!obj.selectable) return false;
      
      // Get object's dominant color (simplified - uses fill or stroke)
      const objColor = getObjectColor(obj);
      if (!objColor) return false;
      
      return colorSimilarity(targetColor, objColor) <= threshold;
    });
    
    const hasObjects = objects.length > 0;
    
    if (hasObjects) {
      canvas.discardActiveObject();
      if (objects.length === 1) {
        canvas.setActiveObject(objects[0]);
      } else {
        const selection = new fabric.ActiveSelection(objects, { canvas });
        canvas.setActiveObject(selection);
      }
      
      // Calculate combined bounds
      const allBounds = objects.map(obj => obj.getBoundingRect());
      const bounds = {
        left: Math.min(...allBounds.map(b => b.left)),
        top: Math.min(...allBounds.map(b => b.top)),
        width: 0,
        height: 0,
      };
      bounds.width = Math.max(...allBounds.map(b => b.left + b.width)) - bounds.left;
      bounds.height = Math.max(...allBounds.map(b => b.top + b.height)) - bounds.top;
      
      setState(prev => ({
        ...prev,
        hasSelection: true,
        hasObjectsSelected: true,
        selectionBounds: bounds,
        activeAction: 'transform',
      }));
      
      canvas.requestRenderAll();
    }
  }, [canvas, state.mode, state.magicThreshold, isToolActive]);

  // Set up magic select click handler
  useEffect(() => {
    if (!canvas || state.mode !== 'magic' || !isToolActive) return;
    
    // Keep selection enabled for object manipulation
    canvas.selection = true;
    
    const handleMagicSelect = (opt: any) => {
      // Check if clicking on an existing object - if so, let Fabric handle it
      const target = canvas.findTarget(opt.e);
      if (target && target.selectable) {
        // User clicked on a selectable object, don't do magic select
        return;
      }
      performMagicSelect(opt);
    };

    canvas.on('mouse:down', handleMagicSelect);

    return () => {
      canvas.off('mouse:down', handleMagicSelect);
    };
  }, [canvas, state.mode, isToolActive, performMagicSelect]);

  // Listen for Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  return {
    mode: state.mode,
    magicThreshold: state.magicThreshold,
    setMode,
    setMagicThreshold,
    isSelecting: state.isSelecting,
    hasSelection: state.hasSelection,
    hasObjectsSelected: state.hasObjectsSelected,
    selectionBounds: state.selectionBounds,
    activeAction: state.activeAction,
    setActiveAction,
    clearSelection,
  };
};

// Helper: Check if point is inside polygon (ray casting algorithm)
function isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = polygon.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

// Helper: Get object's color
function getObjectColor(obj: fabric.Object): { r: number; g: number; b: number } | null {
  const fill = obj.fill;
  if (typeof fill === 'string' && fill.startsWith('#')) {
    return hexToRgb(fill);
  }
  if (typeof fill === 'string' && fill.startsWith('rgb')) {
    const match = fill.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
    }
  }
  // For paths/strokes
  const stroke = obj.stroke;
  if (typeof stroke === 'string' && stroke.startsWith('#')) {
    return hexToRgb(stroke);
  }
  return null;
}

// Helper: Hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Helper: Color similarity (0 = identical, 1 = completely different)
function colorSimilarity(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const rDiff = Math.abs(c1.r - c2.r) / 255;
  const gDiff = Math.abs(c1.g - c2.g) / 255;
  const bDiff = Math.abs(c1.b - c2.b) / 255;
  return (rDiff + gDiff + bDiff) / 3;
}
