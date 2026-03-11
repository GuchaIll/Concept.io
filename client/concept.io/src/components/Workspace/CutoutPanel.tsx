import { useState, useMemo, useEffect, useRef } from 'react';
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
  onConfirm: (maskData: string[], settings: Partial<CutoutSettings>) => void;
  onClose: () => void;
}

export const CutoutPanel = ({
  imageData,
  proposals,
  isLoading = false,
  onConfirm,
  onClose,
}: CutoutPanelProps) => {
  const [mode, setMode] = useState<Mode>('subject');
  const [activeTool, setActiveTool] = useState<Tool>('auto');
  // selectedIds = regions to REMOVE (background). Non-selected = subject (kept).
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [featherRadius, setFeatherRadius] = useState(0);
  const [threshold, setThreshold] = useState(128);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { applyMask } = useCutout();

  // ── Auto-seed background regions on load ───────────────────────
  // Use backgroundScore (CV heuristic) to pick the most background-like regions.
  // Strategy:
  //   1. Select all regions with backgroundScore ≥ 0.60 (clear background).
  //   2. If none qualify, fall back to the single highest-scoring region.
  //   3. Never select ALL regions — always leave at least one as subject.
  useEffect(() => {
    if (proposals.length === 0) return;
    const sorted = [...proposals].sort((a, b) => b.backgroundScore - a.backgroundScore);
    const THRESHOLD = 0.60;
    const strong = sorted.filter(p => p.backgroundScore >= THRESHOLD);
    // Guard: leave at least one region unselected (the subject)
    const eligible = strong.length < proposals.length ? strong : sorted.slice(0, -1);
    const bgIds = eligible.length > 0
      ? new Set(eligible.map(p => p.id))
      : new Set([sorted[0].id]);
    setSelectedIds(bgIds);
  }, [proposals]);

  // Keep stable refs for values used inside the debounce callback so we never
  // close over stale props/state and don't need those values in the dep array.
  const proposalsRef = useRef(proposals);
  const imageDataRef = useRef(imageData);
  const applyMaskRef  = useRef(applyMask);
  useEffect(() => { proposalsRef.current  = proposals;  }, [proposals]);
  useEffect(() => { imageDataRef.current  = imageData;  }, [imageData]);
  useEffect(() => { applyMaskRef.current  = applyMask;  }, [applyMask]);

  // ── Debounced live preview ─────────────────────────────────────
  // Called whenever selection or edge settings change.
  // Passes the SUBJECT masks (not-selected) to applyMask → returns RGBA cutout.
  useEffect(() => {
    if (proposalsRef.current.length === 0 || isLoading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const currentProposals = proposalsRef.current;
      const currentImageData = imageDataRef.current;
      const currentApplyMask = applyMaskRef.current;
      const subjectMasks = currentProposals
        .filter(p => !selectedIds.has(p.id))
        .map(p => p.mask);
      if (subjectMasks.length === 0) {
        setPreviewImage(null);
        return;
      }
      setIsPreviewLoading(true);
      try {
        const result = await currentApplyMask(currentImageData, subjectMasks, { featherRadius, threshold });
        if (result.success && result.imageData) {
          setPreviewImage(result.imageData);
        } else {
          console.error('[CutoutPanel] applyMask failed:', result.error);
        }
      } finally {
        setIsPreviewLoading(false);
      }
    }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selectedIds, featherRadius, threshold, isLoading]);

  // Map SAM proposals → segment descriptors
  const segments = useMemo(
    () =>
      proposals.map((p, i) => ({
        id: p.id,
        name: `Region ${i + 1}`,
        color: `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`,
        // areaRatio is 0.0–1.0 from SAM. Use one decimal; clamp tiny values to show "< 1%".
        area: +(p.areaRatio * 100).toFixed(1),
        areaDisplay:
          p.areaRatio < 0.01
            ? '< 1%'
            : `${+(p.areaRatio * 100).toFixed(1)}%`,
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

  // Switching modes inverts the selection: subject ↔ background are complements.
  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setSelectedIds(new Set(proposals.filter(p => !selectedIds.has(p.id)).map(p => p.id)));
  };

  // Confirm passes the SUBJECT (kept) masks — non-selected proposals.
  const handleConfirm = () => {
    const subjectMasks = proposals
      .filter(p => !selectedIds.has(p.id))
      .map(p => p.mask);
    onConfirm(subjectMasks, { featherRadius, threshold });
  };

  // All overlays are always rendered so every SAM region is visible.
  // Opacity encodes role: subject (kept) = prominent, background (removed) = dimmed.
  const overlayOpacity = (segId: number): number => {
    if (hoveredId === segId) return 0.90;
    if (selectedIds.has(segId)) return 0.25;   // background — dimmed
    return 0.70;                                // subject — prominent
  };

  return (
    <div className="flex flex-col h-full bg-background-dark text-slate-100">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-400 hover:text-white text-xl">
              close
            </span>
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

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-6">

        {/* Image preview */}
        <div className="p-4">
          <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-inner"
               style={{
                 backgroundImage:
                   'linear-gradient(45deg,#333 25%,transparent 25%),linear-gradient(-45deg,#333 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#333 75%),linear-gradient(-45deg,transparent 75%,#333 75%)',
                 backgroundSize: '16px 16px',
                 backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
                 backgroundColor: '#1a1a2e',
               }}
          >
            {/* Base image — shows live cutout preview once available */}
            <img
              src={previewImage ?? imageData}
              className="w-full h-full object-contain"
              alt="Generated preview"
            />

            {/* SAM overlays — all regions always visible, opacity encodes role */}
            {segments.map(seg => (
              <div
                key={seg.id}
                className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-150"
                style={{ opacity: overlayOpacity(seg.id) }}
              >
                {/* Coloured region overlay */}
                <img
                  src={seg.overlay}
                  className="w-full h-full object-contain"
                  alt={`Overlay ${seg.id}`}
                />
                {/* Diagonal hatch pattern on selected (background) regions */}
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

            {/* Loading spinner */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Preview-updating spinner */}
            {isPreviewLoading && (
              <div className="absolute bottom-2 right-2 w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}

            {/* No proposals hint */}
            {!isLoading && proposals.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <p className="text-xs text-white/50 text-center px-4">
                  No regions detected — use the tools below to refine
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="px-4 py-2">
          <div className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-800/50 p-1">
            <ModeButton
              label="Subject"
              active={mode === 'subject'}
              onClick={() => handleModeChange('subject')}
            />
            <ModeButton
              label="Background"
              active={mode === 'background'}
              onClick={() => handleModeChange('background')}
            />
          </div>
        </div>

        {/* Tools */}
        <div className="px-4 mt-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 px-1">
            Refinement Tools
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <ToolButton icon="brush"         label="Brush"  active={activeTool === 'brush'}  onClick={() => setActiveTool('brush')} />
            <ToolButton icon="ink_eraser"    label="Eraser" active={activeTool === 'eraser'} onClick={() => setActiveTool('eraser')} />
            <ToolButton icon="lasso_select"  label="Lasso"  active={activeTool === 'lasso'}  onClick={() => setActiveTool('lasso')} />
            <ToolButton icon="magic_button"  label="Auto"   active={activeTool === 'auto'}   onClick={() => setActiveTool('auto')} />
          </div>
        </div>

        {/* Edge settings */}
        <div className="px-4 mt-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 px-1">
            Edge Settings
          </h3>
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

        {/* Active segments */}
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Active Segments
            </h3>
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
              {segments.map(seg => (
                <button
                  key={seg.id}
                  onClick={() => toggleSegment(seg.id)}
                  onMouseEnter={() => setHoveredId(seg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  title={`bg score: ${(seg.bgScore * 100).toFixed(0)}%`}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 border text-sm font-medium transition-all ${
                    selectedIds.has(seg.id)
                      ? 'bg-primary/20 border-primary/40 text-white'
                      : 'bg-slate-800 border-transparent text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span>{seg.name}</span>
                  <span className="text-[9px] text-slate-500">{seg.areaDisplay}</span>
                  {selectedIds.has(seg.id) && (
                    <span className="material-symbols-outlined text-xs leading-none text-primary">
                      check
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
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
