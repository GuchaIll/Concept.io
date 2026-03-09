/**
 * EditPanel — full-screen overlay for AI inpaint & outpaint editing.
 *
 * Layout mirrors CutoutPanel:
 *   Left  — image preview + mask brush (inpaint) or outpaint handles
 *   Right — mode tabs, prompt, controls, generate button
 *
 * Clicking "Generate" collects parameters and hands them to the parent
 * via onGenerate, then closes immediately.  The edit job runs in the
 * background work queue — the user is never blocked.
 */
import { useState, useRef, useCallback, useMemo } from 'react';
import { MaskBrushCanvas } from './MaskBrushCanvas';
import type { MaskBrushCanvasHandle } from './MaskBrushCanvas';
import { OutpaintHandles } from './OutpaintHandles';
import type { OutpaintPadding } from './OutpaintHandles';

// ── Edit job parameters handed to the parent ───────────────────────────────

export interface EditGenerateParams {
  mode: 'inpaint' | 'outpaint';
  prompt: string;
  strength: number;
  maskData?: string;
  padding?: { top: number; bottom: number; left: number; right: number };
  matchStyle: boolean;
  referenceImageData?: string;
  ipAdapterScale?: number;
  width: number;
  height: number;
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface EditPanelProps {
  /** base64 data-URL of the source image. */
  imageData: string;
  /** Optional natural dimensions (used for outpaint handles). */
  imageWidth?: number;
  imageHeight?: number;
  /** Called when the user clicks Generate — params describe the edit job. */
  onGenerate: (params: EditGenerateParams) => void;
  /** Called when the user closes the panel without generating. */
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const EditPanel = ({
  imageData,
  imageWidth = 1024,
  imageHeight = 1024,
  onGenerate,
  onClose,
}: EditPanelProps) => {
  // ── State ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'inpaint' | 'outpaint'>('inpaint');
  const [prompt, setPrompt] = useState('');
  const [strength, setStrength] = useState(0.75);
  const [brushSize, setBrushSize] = useState(30);
  const [erasing, setErasing] = useState(false);
  const [matchStyle, setMatchStyle] = useState(false);
  const [padding, setPadding] = useState<OutpaintPadding>({ top: 0, bottom: 0, left: 0, right: 0 });
  const [hasMask, setHasMask] = useState(false);

  const maskRef = useRef<MaskBrushCanvasHandle>(null);

  // ── Derived ────────────────────────────────────────────────────────
  // Display scale: fit image into ~500px max while keeping aspect ratio
  const displayScale = useMemo(() => {
    const maxDim = 500;
    const longest = Math.max(imageWidth, imageHeight);
    return longest > maxDim ? maxDim / longest : 1;
  }, [imageWidth, imageHeight]);

  const displayW = Math.round(imageWidth * displayScale);
  const displayH = Math.round(imageHeight * displayScale);

  // ── Generate handler ───────────────────────────────────────────────
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;

    const params: EditGenerateParams = {
      mode: mode === 'outpaint' ? 'outpaint' : 'inpaint',
      prompt: prompt.trim(),
      strength,
      width: imageWidth,
      height: imageHeight,
      matchStyle,
    };

    if (mode === 'inpaint') {
      const maskDataURL = maskRef.current?.getMaskDataURL();
      if (!maskDataURL) return;
      params.maskData = maskDataURL;
    }

    if (mode === 'outpaint') {
      params.padding = padding;
    }

    if (matchStyle) {
      params.referenceImageData = imageData;
      params.ipAdapterScale = 0.6;
    }

    onGenerate(params);
    onClose();
  }, [mode, prompt, strength, imageWidth, imageHeight, padding, matchStyle, imageData, onGenerate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch bg-black/80 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* ═══════════ LEFT PANE — Image preview + mask / outpaint handles ═══════════ */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#0a0e17]">
        <div className="relative" style={{ width: mode === 'outpaint' ? undefined : displayW, height: mode === 'outpaint' ? undefined : displayH }}>
          {mode === 'inpaint' ? (
            <>
              <img
                src={imageData}
                alt="Source"
                className="w-full h-full object-contain rounded-xl shadow-2xl border border-white/10"
                style={{ width: displayW, height: displayH }}
                draggable={false}
              />
              {/* Mask brush overlay */}
              <MaskBrushCanvas
                ref={maskRef}
                brushSize={brushSize}
                erasing={erasing}
                width={imageWidth}
                height={imageHeight}
                onMaskChange={() => setHasMask(true)}
              />
            </>
          ) : (
            /* Outpaint mode — image with drag handles */
            <div className="flex items-center justify-center">
              <OutpaintHandles
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                padding={padding}
                onPaddingChange={setPadding}
                scale={displayScale}
              >
                {/* The image itself is rendered inside via CSS background */}
              </OutpaintHandles>
              {/* Overlay the actual image in the centre */}
              <img
                src={imageData}
                alt="Source"
                className="absolute rounded shadow-xl pointer-events-none"
                style={{
                  width: displayW,
                  height: displayH,
                  left: padding.left * displayScale,
                  top: padding.top * displayScale,
                }}
                draggable={false}
              />
            </div>
          )}

          {/* Brush size cursor indicator (inpaint only) */}
          {mode === 'inpaint' && (
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-[10px] text-white/60 px-2 py-1 rounded">
              {erasing ? 'Eraser' : 'Brush'}: {brushSize}px • Right-click to erase
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ RIGHT PANE — Controls ═══════════ */}
      <div className="w-[340px] border-l border-white/10 bg-background-dark flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-primary text-lg">auto_fix_high</span>
            <h2 className="text-sm font-bold text-white">AI Edit</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setMode('inpaint')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              mode === 'inpaint'
                ? 'border-primary text-primary'
                : 'border-transparent text-white/40 hover:text-white/60'
            }`}
          >
            <span className="material-icons-round text-sm align-middle mr-1">brush</span>
            Inpaint
          </button>
          <button
            onClick={() => setMode('outpaint')}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              mode === 'outpaint'
                ? 'border-primary text-primary'
                : 'border-transparent text-white/40 hover:text-white/60'
            }`}
          >
            <span className="material-icons-round text-sm align-middle mr-1">open_in_full</span>
            Outpaint
          </button>
        </div>

        {/* Scrollable controls area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* Prompt */}
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
              placeholder={
                mode === 'inpaint'
                  ? 'Describe what should replace the masked area…'
                  : 'Describe what should fill the expanded area…'
              }
            />
          </div>

          {/* Inpaint-specific controls */}
          {mode === 'inpaint' && (
            <>
              {/* Strength */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                    Strength
                  </label>
                  <span className="text-[10px] text-white/50 tabular-nums">{strength.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={strength}
                  onChange={e => setStrength(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[9px] text-white/30 mt-0.5">
                  <span>Subtle</span>
                  <span>Strong</span>
                </div>
              </div>

              {/* Brush size */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                    Brush Size
                  </label>
                  <span className="text-[10px] text-white/50 tabular-nums">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              {/* Eraser toggle + clear */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setErasing(!erasing)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    erasing
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <span className="material-icons-round text-sm">
                    {erasing ? 'ink_eraser' : 'brush'}
                  </span>
                  {erasing ? 'Eraser' : 'Brush'}
                </button>
                <button
                  onClick={() => {
                    maskRef.current?.clearMask();
                    setHasMask(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <span className="material-icons-round text-sm">delete_sweep</span>
                  Clear Mask
                </button>
              </div>
            </>
          )}

          {/* Outpaint-specific controls */}
          {mode === 'outpaint' && (
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2 block">
                Padding (px)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['top', 'bottom', 'left', 'right'] as const).map(side => (
                  <div key={side} className="flex items-center gap-2">
                    <label className="text-[10px] text-white/40 capitalize w-10">{side}</label>
                    <input
                      type="number"
                      min={0}
                      max={512}
                      step={8}
                      value={padding[side]}
                      onChange={e => setPadding({ ...padding, [side]: Math.max(0, Number(e.target.value)) })}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setPadding({ top: 64, bottom: 64, left: 64, right: 64 })}
                  className="flex-1 text-[10px] text-white/40 bg-white/5 border border-white/10 rounded py-1.5 hover:bg-white/10 transition-colors"
                >
                  64px all
                </button>
                <button
                  onClick={() => setPadding({ top: 128, bottom: 128, left: 128, right: 128 })}
                  className="flex-1 text-[10px] text-white/40 bg-white/5 border border-white/10 rounded py-1.5 hover:bg-white/10 transition-colors"
                >
                  128px all
                </button>
                <button
                  onClick={() => setPadding({ top: 0, bottom: 0, left: 0, right: 0 })}
                  className="flex-1 text-[10px] text-white/40 bg-white/5 border border-white/10 rounded py-1.5 hover:bg-white/10 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Match Style toggle */}
          <div className="flex items-center justify-between py-2 border-t border-white/10">
            <div>
              <span className="text-xs text-white/70">Match Style</span>
              <p className="text-[10px] text-white/30">Use original as style reference</p>
            </div>
            <button
              onClick={() => setMatchStyle(!matchStyle)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                matchStyle ? 'bg-primary' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  matchStyle ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* ── Bottom generate button ──────────────────────────────────── */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || (mode === 'inpaint' && !hasMask) || (mode === 'outpaint' && padding.top + padding.bottom + padding.left + padding.right === 0)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-white hover:bg-primary/90"
          >
            <span className="material-icons-round text-lg">auto_fix_high</span>
            Generate
          </button>
          <p className="text-center text-[10px] text-white/30 mt-1.5">
            Ctrl+Enter to generate • Esc to close
          </p>
        </div>
      </div>
    </div>
  );
};
