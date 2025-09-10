import { useState, useEffect, useCallback } from 'react';
import * as fabric from 'fabric';
import { useTool } from '../contexts/ToolContext';
import { type RGBAColor } from './Color';

interface FloodFillResult {
    x: number;
    y: number;
    width: number;
    height: number;
    coords: Uint8ClampedArray;
}

export const useFill = (canvas: fabric.Canvas | null, currentColor?: RGBAColor) => {
    const { state: toolState } = useTool();
    const isFillToolActive = toolState.activeToolId === 'Fill';
    const [tolerance] = useState(2);

    const withinTolerance = useCallback((array1: Uint8ClampedArray, offset: number, array2: number[], tolerance: number = 0): boolean => {
        const length = array2.length;
        const start = offset + length;

        for (let i = 0; i < length; i++) {
            if (Math.abs(array1[start - length + i] - array2[i]) > tolerance) {
                return false;
            }
        }
        return true;
    }, []);

    const floodFill = useCallback((
        imageData: Uint8ClampedArray,
        getPointOffset: (x: number, y: number) => number,
        point: { x: number; y: number },
        fillColor: number[],
        targetColor: number[],
        tolerance: number,
        width: number,
        height: number
    ): FloodFillResult => {
        const directions = [[1, 0], [0, 1], [0, -1], [-1, 0]];
        const coords = new Uint8ClampedArray(imageData.length);
        const points = [point];
        const seen: { [key: string]: boolean } = {};
        
        let minX = -1, maxX = -1, minY = -1, maxY = -1;

        while (points.length > 0) {
            const currentPoint = points.pop()!;
            const x = currentPoint.x;
            const y = currentPoint.y;
            const offset = getPointOffset(x, y);

            if (!withinTolerance(imageData, offset, targetColor, tolerance)) {
                continue;
            }

            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (x < minX || minX === -1) minX = x;
            if (y < minY || minY === -1) minY = y;

            // Update pixel color
            for (let i = 0; i < 4; i++) {
                imageData[offset + i] = fillColor[i];
                coords[offset + i] = fillColor[i];
            }

            // Check neighboring pixels
            for (const [dx, dy] of directions) {
                const x2 = x + dx;
                const y2 = y + dy;
                const key = `${x2},${y2}`;

                if (x2 < 0 || y2 < 0 || x2 >= width || y2 >= height || seen[key]) {
                    continue;
                }

                points.push({ x: x2, y: y2 });
                seen[key] = true;
            }
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            coords
        };
    }, [withinTolerance]);

    const handleFill = useCallback((event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
        if (!canvas || !currentColor) return;

        const pointer = canvas.getPointer(event.e);
        const mouseX = Math.round(pointer.x);
        const mouseY = Math.round(pointer.y);
        
        // Get canvas context and image data
        const context = canvas.getContext();
        const imageData = context.getImageData(0, 0, canvas.width!, canvas.height!);
        
        const getPointOffset = (x: number, y: number) => {
            return 4 * (y * imageData.width + x);
        };

        const targetOffset = getPointOffset(mouseX, mouseY);
        const targetColor = Array.from(imageData.data.slice(targetOffset, targetOffset + 4));
        
        // Convert current color to array format
        const fillColor = [
            currentColor.r,
            currentColor.g,
            currentColor.b,
            Math.round(currentColor.a * 255)
        ];

        // Check if we're trying to fill with the same color
        if (withinTolerance(new Uint8ClampedArray(targetColor), 0, fillColor, tolerance)) {
            console.log('Ignore... same color');
            return;
        }

        // Perform flood fill
        const result = floodFill(
            imageData.data,
            getPointOffset,
            { x: mouseX, y: mouseY },
            fillColor,
            targetColor,
            tolerance,
            imageData.width,
            imageData.height
        );

        if (result.width === 0 || result.height === 0) {
            return;
        }

        // Create temporary canvas for the fill result
        const tmpCanvas = document.createElement('canvas');
        const tmpCtx = tmpCanvas.getContext('2d')!;
        tmpCanvas.width = canvas.width!;
        tmpCanvas.height = canvas.height!;

        // Apply the fill result
        const fillData = new ImageData(canvas.width!, canvas.height!);
        fillData.data.set(result.coords);
        tmpCtx.putImageData(fillData, 0, 0);

        // Crop to the filled area
        const croppedData = tmpCtx.getImageData(result.x, result.y, result.width, result.height);
        tmpCanvas.width = result.width;
        tmpCanvas.height = result.height;
        tmpCtx.putImageData(croppedData, 0, 0);

        // Add the filled area as a new fabric image
        const imgElement = new Image();
        imgElement.onload = () => {
            const fabricImage = new fabric.Image(imgElement, {
                left: result.x,
                top: result.y,
                selectable: false
            });
            canvas.add(fabricImage);
            canvas.requestRenderAll();
        };
        imgElement.src = tmpCanvas.toDataURL();
    }, [canvas, currentColor, tolerance, floodFill, withinTolerance]);

    useEffect(() => {
        if (!canvas) return;

        if (isFillToolActive) {
            canvas.defaultCursor = 'crosshair';
            canvas.selection = false;
            canvas.on('mouse:down', handleFill);
        } else {
            canvas.defaultCursor = 'default';
            canvas.off('mouse:down', handleFill);
        }

        return () => {
            canvas.off('mouse:down', handleFill);
        };
    }, [canvas, isFillToolActive, handleFill]);

    return {
        isFillToolActive
    };
};
