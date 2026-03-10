/**
 * MaskBrushCanvas — transparent <canvas> overlay for painting inpaint masks.
 *
 * Draws red translucent circles on mousedown+mousemove. Right-click or eraser
 * toggle clears mask pixels. Exposes getMaskDataURL() which converts the
 * red paint → white-on-black mask PNG for the /api/edit inpaint payload.
 */
import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface MaskBrushCanvasHandle {
  /** Returns a base64 data-URL of a white-on-black mask PNG. */
  getMaskDataURL: () => string;
  /** Clear the entire mask. */
  clearMask: () => void;
}

interface MaskBrushCanvasProps {
  /** Brush radius in CSS pixels. */
  brushSize: number;
  /** True = eraser mode (clears mask under cursor). */
  erasing?: boolean;
  /** Called on every stroke so the parent can update mask-dirty state. */
  onMaskChange?: () => void;
  /** Width of the canvas (should match the image). */
  width: number;
  /** Height of the canvas (should match the image). */
  height: number;
}

export const MaskBrushCanvas = forwardRef<MaskBrushCanvasHandle, MaskBrushCanvasProps>(
  ({ brushSize, erasing = false, onMaskChange, width, height }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const erasingRef = useRef(erasing);
    erasingRef.current = erasing;

    // ── Imperative handle ──────────────────────────────────────────
    const getMaskDataURL = useCallback((): string => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      const ctx = canvas.getContext('2d')!;
      const src = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Create white-on-black mask: any non-zero red pixel → white
      const out = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < src.data.length; i += 4) {
        const painted = src.data[i + 3] > 10; // has alpha → was painted
        out.data[i] = painted ? 255 : 0;
        out.data[i + 1] = painted ? 255 : 0;
        out.data[i + 2] = painted ? 255 : 0;
        out.data[i + 3] = 255;
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      offscreen.getContext('2d')!.putImageData(out, 0, 0);
      return offscreen.toDataURL('image/png');
    }, []);

    const clearMask = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onMaskChange?.();
    }, [onMaskChange]);

    useImperativeHandle(ref, () => ({ getMaskDataURL, clearMask }), [getMaskDataURL, clearMask]);

    // ── Drawing logic ──────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;

      const getPos = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        };
      };

      const paint = (x: number, y: number) => {
        if (erasingRef.current) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, brushSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
          ctx.beginPath();
          ctx.arc(x, y, brushSize, 0, Math.PI * 2);
          ctx.fill();
        }
        onMaskChange?.();
      };

      const onDown = (e: MouseEvent) => {
        // Right-click → temporary eraser
        if (e.button === 2) erasingRef.current = true;
        drawing.current = true;
        const { x, y } = getPos(e);
        paint(x, y);
      };

      const onMove = (e: MouseEvent) => {
        if (!drawing.current) return;
        const { x, y } = getPos(e);
        paint(x, y);
      };

      const onUp = (e: MouseEvent) => {
        drawing.current = false;
        // Restore eraser mode to prop value after right-click release
        if (e.button === 2) erasingRef.current = erasing;
      };

      const onContext = (e: MouseEvent) => e.preventDefault();

      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseup', onUp);
      canvas.addEventListener('mouseleave', onUp);
      canvas.addEventListener('contextmenu', onContext);

      return () => {
        canvas.removeEventListener('mousedown', onDown);
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseup', onUp);
        canvas.removeEventListener('mouseleave', onUp);
        canvas.removeEventListener('contextmenu', onContext);
      };
    }, [brushSize, erasing, onMaskChange]);

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
    );
  },
);

MaskBrushCanvas.displayName = 'MaskBrushCanvas';
