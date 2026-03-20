/**
 * LiquifyPanel — Photoshop-style mesh warp tool for image assets.
 *
 * Renders a full-screen overlay with:
 *   Left  — canvas with the image + deformable mesh grid overlay
 *   Right — tool controls (brush size, strength, grid toggle, reset, apply)
 *
 * Two interaction modes (unified on the same canvas):
 *   • Drag near a control point → move that specific mesh vertex precisely
 *   • Drag anywhere else        → smooth brush-warp that pushes nearby vertices
 *
 * Algorithm: inverse bilinear mesh warp.
 *   For each grid cell the deformed (destination) quad corners are mapped
 *   back to the original (source) quad via a per-pixel bilinear inverse solve.
 *   This gives a smooth, continuous warp with no seams.
 */

import { useRef, useEffect, useCallback, useState } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const GRID_COLS = 8;
const GRID_ROWS = 8;
const GRAB_RADIUS = 14;   // px — within this distance a click selects a vertex
const PT_RADIUS = 4;       // visual radius of a control-point dot
const MAX_DISPLAY = 580;   // maximum display canvas edge (px)

// ── Types ────────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

export interface LiquifyPanelProps {
  /** base64 data-URL of the source image (any format accepted by <img>) */
  imageData: string;
  /** natural pixel width of the source image */
  imageWidth: number;
  /** natural pixel height of the source image */
  imageHeight: number;
  /** called when the user clicks "Apply Warp" — receives a PNG data-URL */
  onApply: (resultImageData: string) => void;
  /** called when the user cancels without applying */
  onClose: () => void;
}

// ── Math helpers ─────────────────────────────────────────────────────────────

/** Smooth falloff: 1 at t=0, 0 at t≥1, C1 continuous */
function falloff(t: number): number {
  if (t >= 1) return 0;
  const s = 1 - t * t;
  return s * s;
}

/**
 * Inverse bilinear: given the four corners of a deformed quad and a point
 * (px, py), solve for (u, v) ∈ [0,1]² such that:
 *
 *   P(u,v) = (1-u)(1-v)·Q00 + u(1-v)·Q10 + (1-u)v·Q01 + uv·Q11 = (px, py)
 *
 * Returns null when the point lies outside the quad.
 *
 * Corner ordering (UV space):
 *   Q00 → (u=0, v=0)   Q10 → (u=1, v=0)
 *   Q01 → (u=0, v=1)   Q11 → (u=1, v=1)
 */
function invBilinear(
  Q00: Pt, Q10: Pt, Q01: Pt, Q11: Pt,
  px: number, py: number,
): [number, number] | null {
  const ax = Q10.x - Q00.x, bx = Q01.x - Q00.x;
  const cx = Q00.x + Q11.x - Q10.x - Q01.x, dx = px - Q00.x;
  const ay = Q10.y - Q00.y, by = Q01.y - Q00.y;
  const cy = Q00.y + Q11.y - Q10.y - Q01.y, dy = py - Q00.y;

  // Expand P(u,v)·x = px into a quadratic in v:
  //   (by·cx − cy·bx)·v² + (−ay·bx + by·ax + cy·dx − dy·cx)·v + (ay·dx − dy·ax) = 0
  const A = by * cx - cy * bx;
  const B = -ay * bx + by * ax + cy * dx - dy * cx;
  const C = ay * dx - dy * ax;

  let v: number;
  if (Math.abs(A) < 1e-9) {
    if (Math.abs(B) < 1e-9) return null;
    v = -C / B;
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(Math.max(0, disc));
    const v1 = (-B + sq) / (2 * A);
    const v2 = (-B - sq) / (2 * A);
    const inRange = (t: number) => t >= -1e-4 && t <= 1 + 1e-4;
    if (inRange(v1)) v = v1;
    else if (inRange(v2)) v = v2;
    else return null;
  }
  v = Math.max(0, Math.min(1, v));

  // Solve for u using the less-degenerate axis
  const denomX = ax + cx * v;
  const denomY = ay + cy * v;
  let u: number;
  if (Math.abs(denomX) >= Math.abs(denomY)) {
    if (Math.abs(denomX) < 1e-9) return null;
    u = (dx - bx * v) / denomX;
  } else {
    if (Math.abs(denomY) < 1e-9) return null;
    u = (dy - by * v) / denomY;
  }
  u = Math.max(0, Math.min(1, u));
  return [u, v];
}

/** Bilinear interpolation over a quad */
function bilerp(P00: Pt, P10: Pt, P01: Pt, P11: Pt, u: number, v: number): Pt {
  const iu = 1 - u, iv = 1 - v;
  return {
    x: iu * iv * P00.x + u * iv * P10.x + iu * v * P01.x + u * v * P11.x,
    y: iu * iv * P00.y + u * iv * P10.y + iu * v * P01.y + u * v * P11.y,
  };
}

/** Bilinear sample from a raw pixel buffer */
function sampleBilinear(
  data: Uint8ClampedArray, w: number, h: number, x: number, y: number,
): [number, number, number, number] {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0, ifx = 1 - fx, ify = 1 - fy;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  return [
    ifx * ify * data[i00]     + fx * ify * data[i10]     + ifx * fy * data[i01]     + fx * fy * data[i11],
    ifx * ify * data[i00 + 1] + fx * ify * data[i10 + 1] + ifx * fy * data[i01 + 1] + fx * fy * data[i11 + 1],
    ifx * ify * data[i00 + 2] + fx * ify * data[i10 + 2] + ifx * fy * data[i01 + 2] + fx * fy * data[i11 + 2],
    ifx * ify * data[i00 + 3] + fx * ify * data[i10 + 3] + ifx * fy * data[i01 + 3] + fx * fy * data[i11 + 3],
  ];
}

// ── Core warp algorithm ──────────────────────────────────────────────────────

/**
 * Apply mesh warp via inverse bilinear cell-by-cell mapping.
 *
 * @param src    Source image pixels
 * @param orig   Original (undisplaced) grid control points, row-major
 * @param curr   Current (displaced) grid control points, row-major
 * @param cols   Number of grid columns
 * @param rows   Number of grid rows
 * @param dstW   Destination image width
 * @param dstH   Destination image height
 */
function applyMeshWarp(
  src: ImageData,
  orig: Pt[], curr: Pt[],
  cols: number, rows: number,
  dstW: number, dstH: number,
): ImageData {
  const out = new ImageData(dstW, dstH);
  const outData = out.data;
  const srcData = src.data;
  const sw = src.width, sh = src.height;
  const stride = cols + 1;

  for (let cj = 0; cj < rows; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      // Deformed (destination) quad corners
      const Q00 = curr[cj * stride + ci];
      const Q10 = curr[cj * stride + ci + 1];
      const Q01 = curr[(cj + 1) * stride + ci];
      const Q11 = curr[(cj + 1) * stride + ci + 1];

      // Original (source) quad corners
      const P00 = orig[cj * stride + ci];
      const P10 = orig[cj * stride + ci + 1];
      const P01 = orig[(cj + 1) * stride + ci];
      const P11 = orig[(cj + 1) * stride + ci + 1];

      // Bounding box of the deformed quad in destination space
      const xmin = Math.max(0, Math.floor(Math.min(Q00.x, Q10.x, Q01.x, Q11.x)));
      const xmax = Math.min(dstW - 1, Math.ceil(Math.max(Q00.x, Q10.x, Q01.x, Q11.x)));
      const ymin = Math.max(0, Math.floor(Math.min(Q00.y, Q10.y, Q01.y, Q11.y)));
      const ymax = Math.min(dstH - 1, Math.ceil(Math.max(Q00.y, Q10.y, Q01.y, Q11.y)));

      for (let py = ymin; py <= ymax; py++) {
        for (let px = xmin; px <= xmax; px++) {
          const uv = invBilinear(Q00, Q10, Q01, Q11, px, py);
          if (!uv) continue;
          const sp = bilerp(P00, P10, P01, P11, uv[0], uv[1]);
          const [r, g, b, a] = sampleBilinear(srcData, sw, sh, sp.x, sp.y);
          const di = (py * dstW + px) * 4;
          outData[di] = r; outData[di + 1] = g; outData[di + 2] = b; outData[di + 3] = a;
        }
      }
    }
  }
  return out;
}

// ── Canvas draw helpers ───────────────────────────────────────────────────────

function drawMeshGrid(
  ctx: CanvasRenderingContext2D,
  pts: Pt[], cols: number, rows: number,
  hoverIdx: number, dragIdx: number,
) {
  const stride = cols + 1;
  ctx.save();

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1;
  // Horizontal rows
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(pts[r * stride].x, pts[r * stride].y);
    for (let c = 1; c <= cols; c++) ctx.lineTo(pts[r * stride + c].x, pts[r * stride + c].y);
    ctx.stroke();
  }
  // Vertical columns
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(pts[c].x, pts[c].y);
    for (let r = 1; r <= rows; r++) ctx.lineTo(pts[r * stride + c].x, pts[r * stride + c].y);
    ctx.stroke();
  }

  // Control-point handles
  for (let i = 0; i < pts.length; i++) {
    const active = i === dragIdx;
    const hover  = i === hoverIdx && dragIdx === -1;
    const rad    = active ? PT_RADIUS + 3 : hover ? PT_RADIUS + 2 : PT_RADIUS;
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, rad, 0, Math.PI * 2);
    ctx.fillStyle   = active ? '#2b6cee' : hover ? '#60a5fa' : 'rgba(255,255,255,0.80)';
    ctx.strokeStyle = active ? '#1e4fd8' : 'rgba(0,0,0,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  mx: number, my: number,
  radius: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  // tiny center dot
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(mx, my, 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.70)';
  ctx.fill();
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export const LiquifyPanel = ({
  imageData,
  imageWidth,
  imageHeight,
  onApply,
  onClose,
}: LiquifyPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Source image at display resolution (immutable after init)
  const srcImgDataRef = useRef<ImageData | null>(null);
  // Display canvas dimensions
  const dispRef = useRef({ w: 0, h: 0 });
  const [dispSize, setDispSize] = useState({ w: 0, h: 0 });

  // Grid points — kept in refs so canvas ops don't go through React state during drag
  const origPtsRef = useRef<Pt[]>([]);
  const currPtsRef = useRef<Pt[]>([]);

  // Cached warped image (recomputed only when grid changes)
  const warpCacheRef = useRef<ImageData | null>(null);

  // Interaction refs (avoids stale closures in event handlers)
  const dragIdxRef       = useRef(-1);
  const isBrushRef       = useRef(false);
  const lastMouseRef     = useRef<Pt>({ x: -1, y: -1 });
  const hoverIdxRef      = useRef(-1);
  // Control-point drag: track where the drag began so displacement is absolute,
  // not accumulated-delta (prevents drift over multiple frames).
  const dragStartPtRef   = useRef<Pt>({ x: 0, y: 0 });
  const dragStartPtsRef  = useRef<Pt[]>([]);

  // Refs kept in sync with React-controlled UI state (for use inside callbacks)
  const showGridRef      = useRef(true);
  const brushSizeRef     = useRef(80);
  const brushStrengthRef = useRef(0.5);

  // React state for UI
  const [showGrid, setShowGrid]           = useState(true);
  const [brushSize, setBrushSize]         = useState(80);
  const [brushStrength, setBrushStrength] = useState(0.5);
  const [isApplying, setIsApplying]       = useState(false);
  // Bump to force a re-render after reset (so React cursor state refreshes)
  const [, forceUpdate] = useState(0);

  // Keep refs in sync with state
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { brushStrengthRef.current = brushStrength; }, [brushStrength]);

  // ── Init: load image → build source ImageData + initial grid ──────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(MAX_DISPLAY / img.naturalWidth, MAX_DISPLAY / img.naturalHeight, 1);
      const dw = Math.round(img.naturalWidth * scale);
      const dh = Math.round(img.naturalHeight * scale);

      const off = document.createElement('canvas');
      off.width = dw; off.height = dh;
      const octx = off.getContext('2d')!;
      octx.drawImage(img, 0, 0, dw, dh);
      srcImgDataRef.current = octx.getImageData(0, 0, dw, dh);

      const pts: Pt[] = [];
      for (let r = 0; r <= GRID_ROWS; r++)
        for (let c = 0; c <= GRID_COLS; c++)
          pts.push({ x: c * dw / GRID_COLS, y: r * dh / GRID_ROWS });

      origPtsRef.current = pts;
      currPtsRef.current = pts.map(p => ({ ...p }));
      dispRef.current = { w: dw, h: dh };
      setDispSize({ w: dw, h: dh });
    };
    img.src = imageData;
  }, [imageData]);

  // ── Rendering ─────────────────────────────────────────────────────────────

  /** Recompute warp + redraw everything. Call when grid points change. */
  const fullRedraw = useCallback(() => {
    const canvas = canvasRef.current;
    const src    = srcImgDataRef.current;
    const curr   = currPtsRef.current;
    if (!canvas || !src || curr.length === 0) return;

    const { w, h } = dispRef.current;
    const warped = applyMeshWarp(src, origPtsRef.current, curr, GRID_COLS, GRID_ROWS, w, h);
    warpCacheRef.current = warped;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(warped, 0, 0);

    if (showGridRef.current) {
      drawMeshGrid(ctx, curr, GRID_COLS, GRID_ROWS, hoverIdxRef.current, dragIdxRef.current);
    }
    const m = lastMouseRef.current;
    if (m.x >= 0 && dragIdxRef.current < 0) {
      drawBrushCursor(ctx, m.x, m.y, brushSizeRef.current / 2);
    }
  }, []);

  /** Redraw from cache — cheap, just overlay the grid + brush cursor. */
  const overlayRedraw = useCallback((mx: number, my: number) => {
    const canvas = canvasRef.current;
    const warped = warpCacheRef.current;
    if (!canvas || !warped) return;

    const { w, h } = dispRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(warped, 0, 0);

    if (showGridRef.current) {
      drawMeshGrid(ctx, currPtsRef.current, GRID_COLS, GRID_ROWS, hoverIdxRef.current, dragIdxRef.current);
    }
    if (mx >= 0 && dragIdxRef.current < 0) {
      drawBrushCursor(ctx, mx, my, brushSizeRef.current / 2);
    }
  }, []);

  // Initial render when dispSize is set
  useEffect(() => {
    if (dispSize.w > 0) fullRedraw();
  }, [dispSize, fullRedraw]);

  // Re-render when showGrid toggles (no warp recompute needed)
  useEffect(() => {
    overlayRedraw(lastMouseRef.current.x, lastMouseRef.current.y);
  }, [showGrid, overlayRedraw]);

  // ── Interaction helpers ───────────────────────────────────────────────────

  const getCanvasPos = (e: React.MouseEvent | MouseEvent): Pt => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = dispRef.current.w / rect.width;
    const scaleY = dispRef.current.h / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  };

  const findNearestPt = (pos: Pt): number => {
    let best = -1, bestD = Infinity;
    const pts = currPtsRef.current;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pos.x, pts[i].y - pos.y);
      if (d < GRAB_RADIUS && d < bestD) { best = i; bestD = d; }
    }
    return best;
  };

  // ── Mouse handlers ────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const idx = findNearestPt(pos);
    if (idx >= 0) {
      dragIdxRef.current   = idx;
      isBrushRef.current   = false;
      // Snapshot where the drag started and the full point set so displacement
      // is always computed relative to the initial state (no frame-to-frame drift).
      dragStartPtRef.current  = { ...pos };
      dragStartPtsRef.current = currPtsRef.current.map(p => ({ ...p }));
    } else {
      dragIdxRef.current   = -1;
      isBrushRef.current   = true;
      lastMouseRef.current = pos;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos  = getCanvasPos(e);
    const prev = { ...lastMouseRef.current }; // snapshot BEFORE updating — needed for brush delta
    lastMouseRef.current = pos;

    // Update hover highlight
    const newHover = findNearestPt(pos);
    const hoverChanged = newHover !== hoverIdxRef.current;
    if (hoverChanged) hoverIdxRef.current = newHover;

    // ── Control-point drag ─ radial pressure influence ───────────────────────
    // The grabbed vertex follows the cursor exactly.  All other vertices within
    // brushRadius are displaced by the same absolute offset (cursor − dragStart)
    // weighted by falloff(distance_from_grabbed_vertex / brushRadius).
    // This prevents hard mesh angles when the brush covers neighbouring cells.
    if (dragIdxRef.current >= 0) {
      const br        = Math.max(brushSizeRef.current / 2, GRAB_RADIUS * 2);
      const str       = brushStrengthRef.current;
      const origin    = dragStartPtsRef.current[dragIdxRef.current];
      const dx        = pos.x - dragStartPtRef.current.x;
      const dy        = pos.y - dragStartPtRef.current.y;
      const startPts  = dragStartPtsRef.current;
      const pts       = currPtsRef.current;

      for (let i = 0; i < pts.length; i++) {
        if (i === dragIdxRef.current) {
          // Center vertex tracks cursor with full precision
          pts[i] = { x: pos.x, y: pos.y };
        } else {
          const t = Math.hypot(startPts[i].x - origin.x, startPts[i].y - origin.y) / br;
          const w = falloff(t) * str;
          if (w <= 0) continue;
          pts[i] = { x: startPts[i].x + dx * w, y: startPts[i].y + dy * w };
        }
      }
      fullRedraw();
      return;
    }

    // ── Brush warp ─ radial pressure push ────────────────────────────────────
    // Each frame applies (delta × falloff(dist/radius) × strength) to every
    // vertex inside the brush.  falloff peaks at the cursor centre (t=0 → 1)
    // and decays smoothly to 0 at the brush edge (t=1 → 0), matching the
    // intended "pressure radial" feel.
    if (isBrushRef.current) {
      const mdx = pos.x - prev.x, mdy = pos.y - prev.y;
      if (Math.abs(mdx) + Math.abs(mdy) > 0.3) {
        const br  = brushSizeRef.current / 2;
        const str = brushStrengthRef.current;
        const pts = currPtsRef.current;
        for (let i = 0; i < pts.length; i++) {
          const t = Math.hypot(pts[i].x - pos.x, pts[i].y - pos.y) / br;
          const w = falloff(t) * str;
          if (w <= 0) continue;
          pts[i] = { x: pts[i].x + mdx * w, y: pts[i].y + mdy * w };
        }
        fullRedraw();
        return;
      }
    }

    // No drag — just refresh the brush cursor / hover
    if (hoverChanged || !isBrushRef.current) {
      overlayRedraw(pos.x, pos.y);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullRedraw, overlayRedraw]);

  const handleMouseUp = useCallback(() => {
    dragIdxRef.current = -1;
    isBrushRef.current = false;
    forceUpdate(v => v + 1); // refresh cursor class
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragIdxRef.current = -1;
    isBrushRef.current = false;
    hoverIdxRef.current = -1;
    lastMouseRef.current = { x: -1, y: -1 };
    overlayRedraw(-1, -1);
  }, [overlayRedraw]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    currPtsRef.current = origPtsRef.current.map(p => ({ ...p }));
    fullRedraw();
  }, [fullRedraw]);

  // ── Apply: run warp at full source resolution ─────────────────────────────

  const handleApply = useCallback(() => {
    setIsApplying(true);

    // Allow React to paint "Applying…" before the heavy computation
    setTimeout(() => {
      const { w, h } = dispRef.current;
      const scaleX = imageWidth  / w;
      const scaleY = imageHeight / h;
      const fullOrig = origPtsRef.current.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
      const fullCurr = currPtsRef.current.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));

      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = imageWidth; off.height = imageHeight;
        const octx = off.getContext('2d')!;
        octx.drawImage(img, 0, 0);
        const fullSrc = octx.getImageData(0, 0, imageWidth, imageHeight);

        const result = applyMeshWarp(
          fullSrc, fullOrig, fullCurr,
          GRID_COLS, GRID_ROWS,
          imageWidth, imageHeight,
        );

        const out = document.createElement('canvas');
        out.width = imageWidth; out.height = imageHeight;
        out.getContext('2d')!.putImageData(result, 0, 0);
        setIsApplying(false);
        onApply(out.toDataURL('image/png'));
      };
      img.src = imageData;
    }, 50);
  }, [imageData, imageWidth, imageHeight, onApply]);

  // ── Cursor ───────────────────────────────────────────────────────────────
  const isHoveringPt = hoverIdxRef.current >= 0;
  const cursor = dragIdxRef.current >= 0 ? 'grabbing' : isHoveringPt ? 'grab' : 'crosshair';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[100] flex"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
    >
      {/* ── Left: canvas area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 overflow-hidden min-w-0">
        {/* Instruction label */}
        <div className="flex items-center gap-2 text-xs text-white/50 select-none">
          <span className="material-icons-round text-primary text-base">waves</span>
          <span>
            <strong className="text-white/70">Drag a control point</strong> to warp precisely ·{' '}
            <strong className="text-white/70">Drag anywhere else</strong> to brush-warp the mesh
          </span>
        </div>

        {/* Canvas + checkerboard container */}
        {dispSize.w > 0 && (
          <div
            className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex-shrink-0"
            style={{
              width: dispSize.w,
              height: dispSize.h,
              // CSS checkerboard for transparent pixels
              backgroundImage:
                'linear-gradient(45deg,#888 25%,transparent 25%),' +
                'linear-gradient(-45deg,#888 25%,transparent 25%),' +
                'linear-gradient(45deg,transparent 75%,#888 75%),' +
                'linear-gradient(-45deg,transparent 75%,#888 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              backgroundColor: '#bbb',
            }}
          >
            <canvas
              ref={canvasRef}
              width={dispSize.w}
              height={dispSize.h}
              className="block absolute inset-0"
              style={{ cursor }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
          </div>
        )}

        {/* Nudge hint below canvas */}
        <p className="text-[10px] text-white/30 select-none">
          {GRID_COLS}×{GRID_ROWS} mesh · {(GRID_COLS + 1) * (GRID_ROWS + 1)} control points
        </p>
      </div>

      {/* ── Right: controls panel ─────────────────────────────────────────── */}
      <aside
        className="w-72 flex flex-col border-l border-white/10 flex-shrink-0"
        style={{ background: '#12151a' }}
      >
        {/* Header */}
        <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Liquify</h2>
            <p className="text-[10px] text-white/40 mt-0.5">Mesh warp · inverse bilinear</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </header>

        <div className="flex-1 p-4 space-y-5 overflow-y-auto">

          {/* Brush controls */}
          <section className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
              Brush Warp
            </label>

            {/* Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/60">Size</span>
                <span className="text-white/40 font-mono">{brushSize}px</span>
              </div>
              <input
                type="range" min={20} max={240} value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Strength */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/60">Strength</span>
                <span className="text-white/40 font-mono">{Math.round(brushStrength * 100)}%</span>
              </div>
              <input
                type="range" min={5} max={100} value={Math.round(brushStrength * 100)}
                onChange={e => setBrushStrength(Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
              />
            </div>
          </section>

          <div className="h-px bg-white/10" />

          {/* Grid toggle */}
          <section className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
              Grid
            </label>
            <button
              type="button"
              onClick={() => setShowGrid(v => !v)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                showGrid
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="material-icons-round text-base">grid_on</span>
              <span className="text-xs font-medium">{showGrid ? 'Grid Visible' : 'Grid Hidden'}</span>
            </button>
          </section>

          <div className="h-px bg-white/10" />

          {/* Tips */}
          <section className="space-y-1.5 px-3 py-2 bg-white/[0.03] rounded-lg border border-white/5 text-[10px] text-white/40 leading-relaxed">
            <p>
              <span className="text-white/60 font-semibold">Control point drag</span> — precise, single-vertex warp.
            </p>
            <p>
              <span className="text-white/60 font-semibold">Brush drag</span> — smooth area warp with distance falloff.
            </p>
            <p>
              <span className="text-white/60 font-semibold">Reset</span> — restore all vertices to original positions.
            </p>
          </section>

          {/* Reset */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 w-full px-3 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-colors"
          >
            <span className="material-icons-round text-base">restart_alt</span>
            <span className="text-xs font-medium">Reset Deformations</span>
          </button>
        </div>

        {/* Footer — Apply / Cancel */}
        <footer className="p-4 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying}
            className="w-full py-2.5 bg-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            {isApplying ? (
              <>
                <span className="material-icons-round text-base animate-spin">refresh</span>
                Applying…
              </>
            ) : (
              <>
                <span className="material-icons-round text-base">check</span>
                Apply Warp
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="w-full py-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-white/60 hover:text-white rounded-lg text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </footer>
      </aside>
    </div>
  );
};
