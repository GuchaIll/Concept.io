/**
 * OutpaintHandles — directional drag handles for expanding an image.
 *
 * Renders four edge handles (top, bottom, left, right) around the image
 * preview.  Drag outward to increase padding on that side; the new area
 * is shown as a checkerboard overlay.
 */
import { useRef, useCallback } from 'react';

export interface OutpaintPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface OutpaintHandlesProps {
  imageWidth: number;
  imageHeight: number;
  padding: OutpaintPadding;
  onPaddingChange: (p: OutpaintPadding) => void;
  /** Scale factor from image-pixels to display-pixels. */
  scale?: number;
}

export const OutpaintHandles = ({
  imageWidth,
  imageHeight,
  padding,
  onPaddingChange,
  scale = 1,
}: OutpaintHandlesProps) => {
  const dragging = useRef<{ side: keyof OutpaintPadding; startPx: number; startVal: number } | null>(null);

  const onPointerDown = useCallback(
    (side: keyof OutpaintPadding) => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const startPx = side === 'left' || side === 'right' ? e.clientX : e.clientY;
      dragging.current = { side, startPx, startVal: padding[side] };
    },
    [padding],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const { side, startPx, startVal } = dragging.current;
      const current = side === 'left' || side === 'right' ? e.clientX : e.clientY;
      let delta = current - startPx;
      // Invert for top/left so dragging outward (up/left) increases padding
      if (side === 'top' || side === 'left') delta = -delta;
      const raw = startVal + Math.round(delta / scale);
      // Snap to multiples of 8, clamp to 0..512
      const clamped = Math.max(0, Math.min(512, Math.round(raw / 8) * 8));
      if (clamped !== padding[side]) {
        onPaddingChange({ ...padding, [side]: clamped });
      }
    },
    [padding, onPaddingChange, scale],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  // Display sizes in CSS pixels
  const dTop = padding.top * scale;
  const dBottom = padding.bottom * scale;
  const dLeft = padding.left * scale;
  const dRight = padding.right * scale;
  const imgW = imageWidth * scale;
  const imgH = imageHeight * scale;
  const totalW = imgW + dLeft + dRight;
  const totalH = imgH + dTop + dBottom;

  const handleBase = 'absolute flex items-center justify-center z-10 select-none touch-none';
  const bar = 'bg-primary/60 hover:bg-primary/90 rounded transition-colors';

  return (
    <div
      className="relative"
      style={{ width: totalW, height: totalH }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Checkerboard border regions */}
      {dTop > 0 && (
        <div
          className="absolute left-0 top-0 checkerboard-sm border border-dashed border-white/20"
          style={{ width: totalW, height: dTop }}
        />
      )}
      {dBottom > 0 && (
        <div
          className="absolute left-0 bottom-0 checkerboard-sm border border-dashed border-white/20"
          style={{ width: totalW, height: dBottom }}
        />
      )}
      {dLeft > 0 && (
        <div
          className="absolute left-0 checkerboard-sm border border-dashed border-white/20"
          style={{ top: dTop, width: dLeft, height: imgH }}
        />
      )}
      {dRight > 0 && (
        <div
          className="absolute right-0 checkerboard-sm border border-dashed border-white/20"
          style={{ top: dTop, width: dRight, height: imgH }}
        />
      )}

      {/* Image sits in the centre */}
      <div
        className="absolute"
        style={{ left: dLeft, top: dTop, width: imgW, height: imgH }}
      />

      {/* ── Drag handles ──────────────────────────────────────── */}
      {/* Top */}
      <div
        onPointerDown={onPointerDown('top')}
        className={`${handleBase} left-1/2 -translate-x-1/2 cursor-ns-resize`}
        style={{ top: Math.max(dTop - 6, 0), width: 48, height: 12 }}
      >
        <div className={`${bar} w-10 h-1.5`} />
      </div>
      {/* Bottom */}
      <div
        onPointerDown={onPointerDown('bottom')}
        className={`${handleBase} left-1/2 -translate-x-1/2 cursor-ns-resize`}
        style={{ bottom: Math.max(dBottom - 6, 0), width: 48, height: 12 }}
      >
        <div className={`${bar} w-10 h-1.5`} />
      </div>
      {/* Left */}
      <div
        onPointerDown={onPointerDown('left')}
        className={`${handleBase} top-1/2 -translate-y-1/2 cursor-ew-resize`}
        style={{ left: Math.max(dLeft - 6, 0), width: 12, height: 48 }}
      >
        <div className={`${bar} w-1.5 h-10`} />
      </div>
      {/* Right */}
      <div
        onPointerDown={onPointerDown('right')}
        className={`${handleBase} top-1/2 -translate-y-1/2 cursor-ew-resize`}
        style={{ right: Math.max(dRight - 6, 0), width: 12, height: 48 }}
      >
        <div className={`${bar} w-1.5 h-10`} />
      </div>

      {/* Padding labels */}
      {dTop > 16 && (
        <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-white/50" style={{ top: 4 }}>
          {padding.top}px
        </span>
      )}
      {dBottom > 16 && (
        <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-white/50" style={{ bottom: 4 }}>
          {padding.bottom}px
        </span>
      )}
      {dLeft > 24 && (
        <span className="absolute top-1/2 -translate-y-1/2 text-[10px] text-white/50" style={{ left: 4 }}>
          {padding.left}px
        </span>
      )}
      {dRight > 24 && (
        <span className="absolute top-1/2 -translate-y-1/2 text-[10px] text-white/50" style={{ right: 4 }}>
          {padding.right}px
        </span>
      )}
    </div>
  );
};
