import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { MaskProposal } from '../../hooks/useCutout';
import { useCutout } from '../../hooks/useCutout';
import type { CutoutSettings } from '../../types/asset.interface';

type Mode = 'subject' | 'background';
type Tool = 'brush' | 'eraser' | 'lasso' | 'auto';

interface CutoutPanelProps {
  /** Base64 generated image */
  imageData: string;
  /** SAM mask proposals — empty while loading */
  proposals: MaskProposal[];
  /** True while SAM is still analysing the image */
  isLoading?: boolean;
  onConfirm: (maskData: string[], settings: Partial<CutoutSettings>, refinementMask?: string) => void;
  onClose: () => void;
}

// ─── Brush size defaults ─────────────────────────────────────────────
const DEFAULT_BRUSH_SIZE = 20;
const MIN_BRUSH_SIZE = 2;
const MAX_BRUSH_SIZE = 100;

/**
 * Full-width two-column cutout editor.
 *
 * Left  – large interactive preview showing the bg-removed result with a
 *          canvas overlay for brush / eraser / lasso refinement.
 * Right – 340 px controls sidebar (mode, tools, edge settings, segments).
 */
export const CutoutPanel = ({
  imageData,
  proposals,
  isLoading = false,
  onConfirm,
  onClose,
}: CutoutPanelProps) => {
  const [mode, setMode] = useState<Mode>('subject');
  const [activeTool, setActiveTool] = useState<Tool>('auto');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [featherRadius, setFeatherRadius] = useState(0);
  const [threshold, setThreshold] = useState(128);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refinement canvas state ────────────────────────────────────
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  /**
   * refinementMaskCanvasRef — offscreen grayscale mask canvas.
   * White (255) = keep, Black (0) = erased by user.
   * Initialised from previewImage's alpha channel.
   */
  const refinementMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Visible interactive overlay that shows tinted strokes to the user */
  const refinementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const imgSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [lassoPoints, setLassoPoints] = useState<Array<{ x: number; y: number }>>([]);
  /** Composite preview (source × refinement mask) shown to user */
  const [compositePreview, setCompositePreview] = useState<string | null>(null);
  /** Per-segment erasure ratio [0-1], keyed by segment id */
  const [segmentErasure, setSegmentErasure] = useState<Map<number, number>>(new Map());

  const { applyMask } = useCutout();

  // ── Auto-seed background regions on load ───────────────────────
  useEffect(() => {
    if (proposals.length === 0) return;
    const sorted = [...proposals].sort((a, b) => b.backgroundScore - a.backgroundScore);
    const THRESHOLD = 0.75;
    const strong = sorted.filter(p => p.backgroundScore >= THRESHOLD);
    const eligible = strong.length < proposals.length ? strong : sorted.slice(0, -1);
    const bgIds =
      eligible.length > 0
        ? new Set(eligible.map(p => p.id))
        : new Set([sorted[0].id]);
    setSelectedIds(bgIds);
  }, [proposals]);

  // Stable refs for debounce callback
  const proposalsRef = useRef(proposals);
  const imageDataRef = useRef(imageData);
  const applyMaskRef = useRef(applyMask);
  useEffect(() => { proposalsRef.current = proposals; }, [proposals]);
  useEffect(() => { imageDataRef.current = imageData; }, [imageData]);
  useEffect(() => { applyMaskRef.current = applyMask; }, [applyMask]);

  // ── Debounced live preview ─────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (proposalsRef.current.length === 0 || isLoading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Abort any in-flight apply request from a previous debounce cycle
    abortRef.current?.abort();
    debounceRef.current = setTimeout(async () => {
      const currentProposals = proposalsRef.current;
      const currentImageData = imageDataRef.current;
      const currentApplyMask = applyMaskRef.current;
      const subjectMasks = currentProposals
        .filter(p => !selectedIds.has(p.id))
        .map(p => p.mask);
      if (subjectMasks.length === 0) {
        setPreviewImage(null);
        setCompositePreview(null);
        return;
      }
      setIsPreviewLoading(true);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const result = await currentApplyMask(currentImageData, subjectMasks, {
          featherRadius,
          threshold,
        }, undefined, ac.signal);
        if (result.success && result.imageData) {
          let fullSizeDataUrl: string;
          if (result.cropBox && result.originalSize) {
            const [x0, y0] = result.cropBox;
            const [origW, origH] = result.originalSize;
            fullSizeDataUrl = await new Promise<string>((resolve) => {
              const tmpImg = new Image();
              tmpImg.onload = () => {
                const offscreen = document.createElement('canvas');
                offscreen.width = origW;
                offscreen.height = origH;
                offscreen.getContext('2d')!.drawImage(tmpImg, x0, y0);
                resolve(offscreen.toDataURL('image/png'));
              };
              tmpImg.src = result.imageData!;
            });
          } else {
            fullSizeDataUrl = result.imageData;
          }
          setPreviewImage(fullSizeDataUrl);
          setCompositePreview(fullSizeDataUrl);

          // Initialise refinement mask from preview alpha channel
          initRefinementMaskFromAlpha(fullSizeDataUrl);
        } else {
          console.error('[CutoutPanel] applyMask failed:', result.error);
        }
      } finally {
        setIsPreviewLoading(false);
      }
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [selectedIds, featherRadius, threshold, isLoading]);

  // ── Resolve source image dimensions ────────────────────────────
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      // Create the offscreen refinement mask canvas at full image resolution
      if (!refinementMaskCanvasRef.current) {
        refinementMaskCanvasRef.current = document.createElement('canvas');
      }
      refinementMaskCanvasRef.current.width = img.naturalWidth;
      refinementMaskCanvasRef.current.height = img.naturalHeight;
      // Fill white (keep everything by default)
      const mCtx = refinementMaskCanvasRef.current.getContext('2d')!;
      mCtx.fillStyle = '#fff';
      mCtx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);

      if (refinementCanvasRef.current) {
        refinementCanvasRef.current.width = img.naturalWidth;
        refinementCanvasRef.current.height = img.naturalHeight;
      }
    };
    img.src = imageData;
  }, [imageData]);

  // ── Initialise refinement mask from preview alpha ──────────────
  const initRefinementMaskFromAlpha = useCallback((previewDataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const { w, h } = imgSizeRef.current;
      if (w === 0 || h === 0) return;

      // Extract alpha channel from preview image
      const tmpCvs = document.createElement('canvas');
      tmpCvs.width = w;
      tmpCvs.height = h;
      const tmpCtx = tmpCvs.getContext('2d')!;
      tmpCtx.drawImage(img, 0, 0, w, h);
      const imgData = tmpCtx.getImageData(0, 0, w, h);

      // Build grayscale mask from alpha: alpha → mask luminance
      if (!refinementMaskCanvasRef.current) {
        refinementMaskCanvasRef.current = document.createElement('canvas');
      }
      const mask = refinementMaskCanvasRef.current;
      mask.width = w;
      mask.height = h;
      const mCtx = mask.getContext('2d')!;
      const mData = mCtx.createImageData(w, h);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const a = imgData.data[i + 3]; // alpha channel
        mData.data[i] = a;     // R
        mData.data[i + 1] = a; // G
        mData.data[i + 2] = a; // B
        mData.data[i + 3] = 255; // full opacity
      }
      mCtx.putImageData(mData, 0, 0);

      // Clear the visual overlay
      if (refinementCanvasRef.current) {
        const vCtx = refinementCanvasRef.current.getContext('2d')!;
        vCtx.clearRect(0, 0, w, h);
      }

      // Reset per-segment erasure
      setSegmentErasure(new Map());
    };
    img.src = previewDataUrl;
  }, []);

  // ── Recomposite preview from source × refinement mask ──────────
  const recomposite = useCallback(() => {
    const { w, h } = imgSizeRef.current;
    if (w === 0 || h === 0) return;
    const mask = refinementMaskCanvasRef.current;
    if (!mask) return;

    const srcImg = new Image();
    srcImg.onload = () => {
      // Draw source image
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(srcImg, 0, 0, w, h);
      const srcData = ctx.getImageData(0, 0, w, h);

      // Read mask
      const mCtx = mask.getContext('2d')!;
      const mData = mCtx.getImageData(0, 0, w, h);

      // Apply: source pixel with alpha = mask luminance
      for (let i = 0; i < srcData.data.length; i += 4) {
        const maskVal = mData.data[i]; // R channel of grayscale mask
        srcData.data[i + 3] = maskVal; // set alpha from mask
      }
      ctx.putImageData(srcData, 0, 0);
      setCompositePreview(out.toDataURL('image/png'));
    };
    srcImg.src = imageData;
  }, [imageData]);

  // ── Compute per-segment erasure percentages ────────────────────
  const updateSegmentErasure = useCallback(() => {
    const mask = refinementMaskCanvasRef.current;
    if (!mask) return;
    const { w, h } = imgSizeRef.current;
    if (w === 0 || h === 0) return;

    const subjectSegs = proposals.filter(p => !selectedIds.has(p.id));

    // Do pixel sampling for active subject segments (async via img load)
    for (const seg of subjectSegs) {
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const SAMPLE = 128;
        const tmpCvs = document.createElement('canvas');
        tmpCvs.width = SAMPLE;
        tmpCvs.height = SAMPLE;
        const tCtx = tmpCvs.getContext('2d')!;
        tCtx.drawImage(tmpImg, 0, 0, SAMPLE, SAMPLE);
        const segData = tCtx.getImageData(0, 0, SAMPLE, SAMPLE);

        // Downsample refinement mask to same size
        const mCvs = document.createElement('canvas');
        mCvs.width = SAMPLE;
        mCvs.height = SAMPLE;
        const mC = mCvs.getContext('2d')!;
        mC.drawImage(mask, 0, 0, SAMPLE, SAMPLE);
        const mD = mC.getImageData(0, 0, SAMPLE, SAMPLE);

        let total = 0;
        let erased = 0;
        for (let i = 0; i < segData.data.length; i += 4) {
          const segAlpha = segData.data[i]; // grayscale mask: R channel
          if (segAlpha > 127) {
            total++;
            if (mD.data[i] < 128) erased++;
          }
        }
        const ratio = total > 0 ? erased / total : 0;
        setSegmentErasure(prev => {
          const next = new Map(prev);
          next.set(seg.id, ratio);
          return next;
        });
      };
      tmpImg.src = seg.mask;
    }
  }, [proposals, selectedIds]);

  // ── Segment descriptors ────────────────────────────────────────
  const segments = useMemo(
    () =>
      proposals.map((p, i) => ({
        id: p.id,
        name: `Region ${i + 1}`,
        color: `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`,
        area: +(p.areaRatio * 100).toFixed(1),
        areaDisplay: p.areaRatio < 0.01 ? '< 1%' : `${+(p.areaRatio * 100).toFixed(1)}%`,
        bgScore: p.backgroundScore,
        score: p.compositeScore,
        overlay: p.overlay,
        mask: p.mask,
      })),
    [proposals],
  );

  const toggleSegment = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setSelectedIds(new Set(proposals.filter(p => !selectedIds.has(p.id)).map(p => p.id)));
  };

  const handleConfirm = () => {
    const subjectMasks = proposals.filter(p => !selectedIds.has(p.id)).map(p => p.mask);
    // Export refinement mask as base64 grayscale PNG
    let refinementMaskB64: string | undefined;
    const mask = refinementMaskCanvasRef.current;
    if (mask && mask.width > 0 && mask.height > 0) {
      const mCtx = mask.getContext('2d')!;
      const mData = mCtx.getImageData(0, 0, mask.width, mask.height);
      // Check if any pixel has been erased (not fully white)
      let hasEdits = false;
      for (let i = 0; i < mData.data.length; i += 4) {
        if (mData.data[i] < 250) { hasEdits = true; break; }
      }
      if (hasEdits) {
        refinementMaskB64 = mask.toDataURL('image/png');
      }
    }
    onConfirm(subjectMasks, { featherRadius, threshold }, refinementMaskB64);
  };

  const overlayOpacity = (segId: number): number => {
    if (hoveredId === segId) return 0.9;
    if (selectedIds.has(segId)) return 0.25;
    return 0.7;
  };

  // ── Refinement drawing helpers ─────────────────────────────────

  /** Convert mouse event → image-space coords */
  const toImageCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = refinementCanvasRef.current;
    if (!cvs) return null;
    const rect = cvs.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * cvs.width,
      y: ((e.clientY - rect.top) / rect.height) * cvs.height,
    };
  }, []);

  /**
   * Paint a filled circle on both:
   * 1. The visual overlay (interim feedback while stroke is in progress)
   * 2. The refinement mask (white = keep, black = erase)
   *
   * Brush  → paint WHITE on mask (restore); clear overlay via destination-out
   *          so the actual image colour shows through from the composite below.
   * Eraser → paint BLACK on mask (erase);  white semi-transparent on overlay
   *          to "white-wash" the erased region.
   */
  const paintCircle = useCallback(
    (x: number, y: number, erase: boolean) => {
      // — Visual overlay —
      const cvs = refinementCanvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d')!;
        if (erase) {
          // White wash to indicate erasure
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath();
          ctx.arc(x, y, brushSize, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fill();
        } else {
          // Punch a hole in the overlay so the real image colour shows through
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, brushSize, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,1)';
          ctx.fill();
        }
      }

      // — Refinement mask —
      const mask = refinementMaskCanvasRef.current;
      if (mask) {
        const mCtx = mask.getContext('2d')!;
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.beginPath();
        mCtx.arc(x, y, brushSize, 0, Math.PI * 2);
        mCtx.fillStyle = erase ? '#000' : '#fff';
        mCtx.fill();
      }
    },
    [brushSize],
  );

  /** Smooth stroke interpolation */
  const interpolate = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }, erase: boolean) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(brushSize / 4, 1);
      const steps = Math.ceil(dist / step);
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        paintCircle(from.x + dx * t, from.y + dy * t, erase);
      }
    },
    [brushSize, paintCircle],
  );

  // ── Mouse handlers ─────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'brush' && activeTool !== 'eraser' && activeTool !== 'lasso') return;
      const pos = toImageCoords(e);
      if (!pos) return;

      if (activeTool === 'lasso') {
        setLassoPoints([pos]);
        return;
      }
      isDrawingRef.current = true;
      lastPosRef.current = pos;
      paintCircle(pos.x, pos.y, activeTool === 'eraser');
    },
    [activeTool, toImageCoords, paintCircle],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = toImageCoords(e);
      if (!pos) return;

      // Lasso — extend path
      if (activeTool === 'lasso' && lassoPoints.length > 0 && e.buttons === 1) {
        setLassoPoints(prev => [...prev, pos]);
        const cvs = refinementCanvasRef.current;
        if (cvs && lassoPoints.length >= 1) {
          const ctx = cvs.getContext('2d')!;
          const prev = lassoPoints[lassoPoints.length - 1];
          ctx.strokeStyle = 'rgba(124,58,237,0.8)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        return;
      }

      // Brush / Eraser — draw
      if (!isDrawingRef.current || (activeTool !== 'brush' && activeTool !== 'eraser')) return;
      if (lastPosRef.current) interpolate(lastPosRef.current, pos, activeTool === 'eraser');
      lastPosRef.current = pos;
    },
    [activeTool, toImageCoords, interpolate, lassoPoints],
  );

  const handleMouseUp = useCallback(() => {
    // Lasso — fill enclosed region on mask (erase)
    if (activeTool === 'lasso' && lassoPoints.length >= 3) {
      // — Visual overlay: white-wash polygon to indicate erasure —
      const cvs = refinementCanvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d')!;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        for (let i = 1; i < lassoPoints.length; i++) ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
        ctx.closePath();
        ctx.fill();
      }
      // — Refinement mask: black polygon (erase) —
      const mask = refinementMaskCanvasRef.current;
      if (mask) {
        const mCtx = mask.getContext('2d')!;
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.fillStyle = '#000';
        mCtx.beginPath();
        mCtx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
        for (let i = 1; i < lassoPoints.length; i++) mCtx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
        mCtx.closePath();
        mCtx.fill();
      }
      setLassoPoints([]);
      recomposite();
      updateSegmentErasure();
      // Clear the visual overlay — the composite preview now shows the real result
      if (cvs) {
        const vCtx = cvs.getContext('2d')!;
        vCtx.clearRect(0, 0, cvs.width, cvs.height);
      }
      return;
    }
    isDrawingRef.current = false;
    lastPosRef.current = null;
    // After brush/eraser stroke ends, recomposite preview & clear overlay
    if (activeTool === 'brush' || activeTool === 'eraser') {
      recomposite();
      updateSegmentErasure();
      // Clear the visual overlay — the composite preview now shows the real result
      const cvs = refinementCanvasRef.current;
      if (cvs) {
        const ctx = cvs.getContext('2d')!;
        ctx.clearRect(0, 0, cvs.width, cvs.height);
      }
    }
  }, [activeTool, lassoPoints, recomposite, updateSegmentErasure]);

  /** Attach canvas ref and set resolution */
  const setupCanvas = useCallback((node: HTMLCanvasElement | null) => {
    refinementCanvasRef.current = node;
    if (node && imgSizeRef.current.w > 0) {
      node.width = imgSizeRef.current.w;
      node.height = imgSizeRef.current.h;
    }
  }, []);

  const toolCursor =
    activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'lasso'
      ? 'crosshair'
      : 'default';

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full">
      {/* ── Left: large interactive preview ─────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-4 bg-[#0a0e17] relative min-w-0">
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          {/* Checkerboard transparency background */}
          <div
            className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
              backgroundColor: '#181825',
            }}
          />

          {/* Preview image — composite when available, raw otherwise */}
          <img
            src={compositePreview ?? previewImage ?? imageData}
            alt="Cutout preview"
            className="relative max-w-full max-h-[calc(100vh-2rem)] object-contain rounded-xl shadow-2xl border border-white/10"
          />

          {/* SAM overlays — only visible in Auto mode */}
          {activeTool === 'auto' &&
            segments.map(seg => (
              <div
                key={seg.id}
                className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-150"
                style={{ opacity: overlayOpacity(seg.id) }}
              >
                <img src={seg.overlay} className="w-full h-full object-contain" alt="" />
                {selectedIds.has(seg.id) && (
                  <img
                    src={seg.overlay}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                      mixBlendMode: 'multiply',
                      opacity: 0.9,
                      maskImage:
                        'repeating-linear-gradient(45deg, transparent, transparent 3px, black 3px, black 5px)',
                      WebkitMaskImage:
                        'repeating-linear-gradient(45deg, transparent, transparent 3px, black 3px, black 5px)',
                    }}
                    alt=""
                  />
                )}
              </div>
            ))}

          {/* Interactive refinement canvas overlay */}
          {(activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'lasso') && (
            <canvas
              ref={setupCanvas}
              className="absolute inset-0 w-full h-full rounded-xl"
              style={{ cursor: toolCursor, touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          )}

          {/* Loading spinner */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Preview-updating spinner */}
          {isPreviewLoading && (
            <div className="absolute bottom-3 right-3 w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* ── Right: controls sidebar ─────────────────────────────── */}
      <div className="w-[340px] flex-shrink-0 flex flex-col h-full border-l border-white/10 bg-background-dark text-slate-100 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined text-slate-400 hover:text-white text-xl">close</span>
            </button>
            <div>
              <h1 className="text-base font-semibold tracking-tight">AI Cutout</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                {isLoading ? 'Analysing…' : `${proposals.length} regions detected`}
              </p>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            disabled={isLoading || selectedIds.size === 0}
            className="bg-primary text-white px-5 py-1.5 rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm
          </button>
        </header>

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto pb-6">
          {/* Mode toggle */}
          <div className="px-4 py-3">
            <div className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-800/50 p-1">
              <ModeButton label="Subject" active={mode === 'subject'} onClick={() => handleModeChange('subject')} />
              <ModeButton label="Background" active={mode === 'background'} onClick={() => handleModeChange('background')} />
            </div>
          </div>

          {/* Refinement Tools */}
          <div className="px-4 mt-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 px-1">
              Refinement Tools
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <ToolButton icon="magic_button" label="Auto" active={activeTool === 'auto'} onClick={() => setActiveTool('auto')} />
              <ToolButton icon="brush" label="Brush" active={activeTool === 'brush'} onClick={() => setActiveTool('brush')} />
              <ToolButton icon="ink_eraser" label="Eraser" active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} />
              <ToolButton icon="lasso_select" label="Lasso" active={activeTool === 'lasso'} onClick={() => setActiveTool('lasso')} />
            </div>

            {/* Brush / Eraser size slider */}
            {(activeTool === 'brush' || activeTool === 'eraser') && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Size</span>
                  <span className="font-mono text-primary">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min={MIN_BRUSH_SIZE}
                  max={MAX_BRUSH_SIZE}
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            )}

            {/* Lasso hint */}
            {activeTool === 'lasso' && (
              <p className="mt-2 text-[10px] text-slate-500 px-1">
                Click and drag to draw a lasso selection. Release to fill the enclosed area.
              </p>
            )}
          </div>

          {/* Edge settings */}
          <div className="px-4 mt-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1">Edge Settings</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Feather</span>
                <span className="font-mono text-primary">{featherRadius}px</span>
              </div>
              <input
                type="range" min={0} max={20} value={featherRadius}
                onChange={e => setFeatherRadius(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Threshold</span>
                <span className="font-mono text-primary">{threshold}</span>
              </div>
              <input
                type="range" min={0} max={255} value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>

          {/* Active Segments */}
          <div className="px-4 mt-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Active Segments</h3>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-slate-500 hover:text-white text-xs transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-1.5">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 rounded-full bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : segments.length === 0 ? (
              <p className="text-xs text-slate-600 px-1">No regions available</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {segments.map(seg => {
                  const erasure = segmentErasure.get(seg.id) ?? 0;
                  const isSubject = !selectedIds.has(seg.id);
                  const dimmed = isSubject && erasure > 0.5;
                  const fullyErased = isSubject && erasure > 0.95;
                  return (
                    <button
                      key={seg.id}
                      onClick={() => toggleSegment(seg.id)}
                      onMouseEnter={() => setHoveredId(seg.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      title={`bg score: ${(seg.bgScore * 100).toFixed(0)}%${isSubject && erasure > 0 ? ` | ${(erasure * 100).toFixed(0)}% erased` : ''}`}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 border text-sm font-medium transition-all ${
                        selectedIds.has(seg.id)
                          ? 'bg-primary/20 border-primary/40 text-white'
                          : 'bg-slate-800 border-transparent text-slate-300 hover:bg-slate-700'
                      } ${dimmed ? 'opacity-50' : ''}`}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className={fullyErased ? 'line-through text-slate-500' : ''}>{seg.name}</span>
                      <span className="text-[9px] text-slate-500">{seg.areaDisplay}</span>
                      {isSubject && erasure > 0 && erasure <= 0.95 && (
                        <span className="text-[9px] text-red-400">{(erasure * 100).toFixed(0)}%</span>
                      )}
                      <span className={`material-symbols-outlined text-xs leading-none text-primary ${selectedIds.has(seg.id) ? '' : 'invisible'}`}>check</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

/* ── Sub-components ──────────────────────────────────────────────────── */

const ModeButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex grow items-center justify-center rounded-lg px-2 py-2 text-sm font-semibold transition-all ${
      active
        ? 'bg-background-dark shadow-sm text-primary'
        : 'text-slate-400 hover:text-white'
    }`}
  >
    {label}
  </button>
);

const ToolButton = ({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-colors ${
      active
        ? 'bg-primary text-white'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
    }`}
  >
    <span className="material-symbols-outlined text-lg">{icon}</span>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default CutoutPanel;