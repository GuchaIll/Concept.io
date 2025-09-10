import { useState, useEffect, useCallback } from 'react'
import * as fabric from 'fabric'
import type { RGBAColor } from './Color'
import { useTool } from '../contexts/ToolContext'

interface EyeDropperProps {
    onColorPicked?: (color: RGBAColor) => void;
}

export const useEyeDropper = (canvas: fabric.Canvas | null, { onColorPicked }: EyeDropperProps = {}) => {
    const { state: toolState } = useTool();
    const isEyeDropperActive = toolState.activeToolId === 'Eyedropper';
    const [pickedColor, setPickedColor] = useState<RGBAColor>({ r: 0, g: 0, b: 0, a: 1 });

    const handleColorPick = useCallback((event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
        if (!canvas) return;

        // Prevent default object selection
        event.e.preventDefault();
        event.e.stopPropagation();

        const pointer = event.viewportPoint;
        const vpt = canvas.viewportTransform!;
        const ratio = window.devicePixelRatio || 1;

         const actualX = Math.round((pointer.x - vpt[4]) / vpt[0] * ratio);
        const actualY = Math.round((pointer.y - vpt[5]) / vpt[3] * ratio)

            // Clamp to integer pixel coordinates
            const clampedX = Math.max(0, Math.min(actualX, canvas.width));
            const clampedY = Math.max(0, Math.min(actualY, canvas.height));

            canvas.renderAll();

            // Read pixel directly from the lowerCanvasEl
            const ctx = canvas.lowerCanvasEl.getContext('2d');
            if (!ctx) return;

            const pixel = ctx.getImageData(clampedX, clampedY, 1, 1).data;

            const color: RGBAColor = {
                r: pixel[0],
                g: pixel[1],
                b: pixel[2],
                a: pixel[3] / 255 // Convert to 0-1 range
            };
            
            setPickedColor(color);
            
            // Notify parent component about the picked color
            if (onColorPicked) {
                onColorPicked(color);
            }
            if (onColorPicked) {
                console.log('EyeDropper picked color:', color);
                onColorPicked(color);
            }
       
    }, [canvas, onColorPicked]);

    useEffect(() => {
        if (!canvas) return;

        if (isEyeDropperActive) {
            // Disable all object interactions
            canvas.selection = false;
            canvas.forEachObject(obj => {
                obj.selectable = false;
                obj.evented = false;
            });
            canvas.defaultCursor = 'crosshair';
            canvas.hoverCursor = 'crosshair';
            
            // Bind event handlers
            canvas.on('mouse:down', handleColorPick);
        } else {
            // Re-enable object interactions
            canvas.selection = true;
            canvas.forEachObject(obj => {
                obj.selectable = true;
                obj.evented = true;
            });
            canvas.defaultCursor = 'default';
            
            // Unbind event handlers
            canvas.off('mouse:down', handleColorPick);
        }

        return () => {
            if (canvas) {
                // Cleanup: restore object interactions and unbind events
                canvas.selection = true;
                canvas.forEachObject(obj => {
                    obj.selectable = true;
                    obj.evented = true;
                });
                canvas.off('mouse:down', handleColorPick);
            }
        };
    }, [canvas, isEyeDropperActive, handleColorPick]);
        
    return {
        isEyeDropperActive,
        pickedColor
    }
}

