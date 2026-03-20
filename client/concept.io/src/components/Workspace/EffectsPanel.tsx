import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EffectsState {
  // Color
  brightnessContrast: { enabled: boolean; brightness: number; contrast: number };
  hueSaturation:      { enabled: boolean; hue: number; saturation: number };
  temperatureTint:    { enabled: boolean; temperature: number; tint: number };
  exposure:           { enabled: boolean; value: number };
  gamma:              { enabled: boolean; value: number };
  // Tone
  vignette:           { enabled: boolean; strength: number; radius: number };
  levels:             { enabled: boolean };
  curves:             { enabled: boolean };
  shadowHighlight:    { enabled: boolean };
  hdr:                { enabled: boolean };
  // Stylize
  blur:               { enabled: boolean; radius: number };
  sharpen:            { enabled: boolean; amount: number };
  pixelate:           { enabled: boolean; size: number };
  motionBlur:         { enabled: boolean };
  dirBlur:            { enabled: boolean };
  posterize:          { enabled: boolean };
  emboss:             { enabled: boolean };
  // Artistic (all stubs)
  sketch:             { enabled: boolean };
  cartoon:            { enabled: boolean };
  watercolor:         { enabled: boolean };
  halftone:           { enabled: boolean };
  inkOutline:         { enabled: boolean };
}

const DEFAULT: EffectsState = {
  brightnessContrast: { enabled: false, brightness: 0, contrast: 0 },
  hueSaturation:      { enabled: false, hue: 0, saturation: 0 },
  temperatureTint:    { enabled: false, temperature: 0, tint: 0 },
  exposure:           { enabled: false, value: 0 },
  gamma:              { enabled: false, value: 1.0 },
  vignette:           { enabled: false, strength: 50, radius: 60 },
  levels:             { enabled: false },
  curves:             { enabled: false },
  shadowHighlight:    { enabled: false },
  hdr:                { enabled: false },
  blur:               { enabled: false, radius: 3 },
  sharpen:            { enabled: false, amount: 50 },
  pixelate:           { enabled: false, size: 8 },
  motionBlur:         { enabled: false },
  dirBlur:            { enabled: false },
  posterize:          { enabled: false },
  emboss:             { enabled: false },
  sketch:             { enabled: false },
  cartoon:            { enabled: false },
  watercolor:         { enabled: false },
  halftone:           { enabled: false },
  inkOutline:         { enabled: false },
};

// ── Pixel helpers ─────────────────────────────────────────────────────────────

function clamp(v: number) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0)
          : max === g ? (b - r) / d + 2
          :             (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = clamp(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [clamp(hue2rgb(h + 1 / 3) * 255), clamp(hue2rgb(h) * 255), clamp(hue2rgb(h - 1 / 3) * 255)];
}

function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(src.length);
  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rv = 0, gv = 0, bv = 0, av = 0, cnt = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.min(Math.max(x + dx, 0), w - 1);
        const i = (y * w + nx) * 4;
        rv += src[i]; gv += src[i + 1]; bv += src[i + 2]; av += src[i + 3]; cnt++;
      }
      const i = (y * w + x) * 4;
      tmp[i] = rv / cnt; tmp[i + 1] = gv / cnt; tmp[i + 2] = bv / cnt; tmp[i + 3] = av / cnt;
    }
  }
  const out = new Uint8ClampedArray(src.length);
  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rv = 0, gv = 0, bv = 0, av = 0, cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.min(Math.max(y + dy, 0), h - 1);
        const i = (ny * w + x) * 4;
        rv += tmp[i]; gv += tmp[i + 1]; bv += tmp[i + 2]; av += tmp[i + 3]; cnt++;
      }
      const i = (y * w + x) * 4;
      out[i] = rv / cnt; out[i + 1] = gv / cnt; out[i + 2] = bv / cnt; out[i + 3] = av / cnt;
    }
  }
  return out;
}

function gaussianBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius * 1.2));
  let d = boxBlur(data, w, h, r);
  d = boxBlur(d, w, h, r);
  d = boxBlur(d, w, h, r);
  return d;
}

function unsharpMask(data: Uint8ClampedArray, w: number, h: number, amount: number): Uint8ClampedArray {
  const blurred = gaussianBlur(data, w, h, 2);
  const out = new Uint8ClampedArray(data.length);
  const s = amount * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    out[i]     = clamp(data[i]     + s * (data[i]     - blurred[i]));
    out[i + 1] = clamp(data[i + 1] + s * (data[i + 1] - blurred[i + 1]));
    out[i + 2] = clamp(data[i + 2] + s * (data[i + 2] - blurred[i + 2]));
    out[i + 3] = data[i + 3];
  }
  return out;
}

function pixelateData(data: Uint8ClampedArray, w: number, h: number, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      let rv = 0, gv = 0, bv = 0, av = 0, cnt = 0;
      for (let dy = 0; dy < size && y + dy < h; dy++) {
        for (let dx = 0; dx < size && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          rv += data[i]; gv += data[i + 1]; bv += data[i + 2]; av += data[i + 3]; cnt++;
        }
      }
      rv /= cnt; gv /= cnt; bv /= cnt; av /= cnt;
      for (let dy = 0; dy < size && y + dy < h; dy++) {
        for (let dx = 0; dx < size && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          out[i] = rv; out[i + 1] = gv; out[i + 2] = bv; out[i + 3] = av;
        }
      }
    }
  }
  return out;
}

function applyVignette(data: Uint8ClampedArray, w: number, h: number, strength: number, radius: number): void {
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy); // 0 at center, ~1.41 at corners
      const t = Math.max(0, (dist - radius) / (1.42 - radius));
      const darkening = 1 - t * t * strength;
      const i = (y * w + x) * 4;
      data[i]     = clamp(data[i]     * darkening);
      data[i + 1] = clamp(data[i + 1] * darkening);
      data[i + 2] = clamp(data[i + 2] * darkening);
    }
  }
}

function applyAllEffects(srcData: Uint8ClampedArray, w: number, h: number, fx: EffectsState): Uint8ClampedArray {
  let data = new Uint8ClampedArray(srcData);

  // Temperature/Tint
  if (fx.temperatureTint.enabled) {
    const temp = fx.temperatureTint.temperature / 100;
    const tnt  = fx.temperatureTint.tint / 100;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i]     + temp * 30 + tnt * 10);
      data[i + 1] = clamp(data[i + 1] + temp * 10 - tnt * 20);
      data[i + 2] = clamp(data[i + 2] - temp * 30 + tnt * 10);
    }
  }

  // Exposure (EV stops → multiply)
  if (fx.exposure.enabled && fx.exposure.value !== 0) {
    const factor = Math.pow(2, fx.exposure.value);
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i]     * factor);
      data[i + 1] = clamp(data[i + 1] * factor);
      data[i + 2] = clamp(data[i + 2] * factor);
    }
  }

  // Gamma: v = (v/255)^(1/γ) * 255
  if (fx.gamma.enabled && fx.gamma.value !== 1.0) {
    const inv = 1 / fx.gamma.value;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(Math.pow(data[i]     / 255, inv) * 255);
      data[i + 1] = clamp(Math.pow(data[i + 1] / 255, inv) * 255);
      data[i + 2] = clamp(Math.pow(data[i + 2] / 255, inv) * 255);
    }
  }

  // Brightness (offset)
  if (fx.brightnessContrast.enabled && fx.brightnessContrast.brightness !== 0) {
    const delta = fx.brightnessContrast.brightness * 2.55;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp(data[i]     + delta);
      data[i + 1] = clamp(data[i + 1] + delta);
      data[i + 2] = clamp(data[i + 2] + delta);
    }
  }

  // Contrast: (v - 128) * factor + 128
  if (fx.brightnessContrast.enabled && fx.brightnessContrast.contrast !== 0) {
    const f = fx.brightnessContrast.contrast / 100;
    const cf = f >= 0 ? 1 + f * 2 : 1 + f;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = clamp((data[i]     - 128) * cf + 128);
      data[i + 1] = clamp((data[i + 1] - 128) * cf + 128);
      data[i + 2] = clamp((data[i + 2] - 128) * cf + 128);
    }
  }

  // Hue rotation
  if (fx.hueSaturation.enabled && fx.hueSaturation.hue !== 0) {
    const shift = fx.hueSaturation.hue / 360;
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const [r, g, b] = hslToRgb((h + shift + 1) % 1, s, l);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  // Saturation
  if (fx.hueSaturation.enabled && fx.hueSaturation.saturation !== 0) {
    const sf = fx.hueSaturation.saturation / 100;
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const ns = Math.max(0, Math.min(1, sf >= 0 ? s + sf * (1 - s) : s + sf * s));
      const [r, g, b] = hslToRgb(h, ns, l);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  // Sharpen (unsharp mask)
  if (fx.sharpen.enabled && fx.sharpen.amount > 0) {
    data = unsharpMask(data, w, h, fx.sharpen.amount / 100);
  }

  // Pixelate
  if (fx.pixelate.enabled && fx.pixelate.size > 1) {
    data = pixelateData(data, w, h, fx.pixelate.size);
  }

  // Blur (3-pass box blur ≈ Gaussian)
  if (fx.blur.enabled && fx.blur.radius > 0) {
    data = gaussianBlur(data, w, h, fx.blur.radius);
  }

  // Vignette (darkens edges in-place)
  if (fx.vignette.enabled && fx.vignette.strength > 0) {
    applyVignette(data, w, h, fx.vignette.strength / 100, fx.vignette.radius / 100);
  }

  return data;
}

// ── UI sub-components ─────────────────────────────────────────────────────────

interface EffectCardProps {
  icon: string;
  title: string;
  enabled: boolean;
  onToggle: () => void;
  stub?: boolean;
  children?: React.ReactNode;
}

function EffectCard({ icon, title, enabled, onToggle, stub = false, children }: EffectCardProps) {
  return (
    <div className={`rounded-xl border transition-colors ${
      enabled ? 'border-primary/40 bg-primary/5' : 'border-white/8 bg-white/[0.02]'
    }`}>
      <button
        onClick={onToggle}
        disabled={stub}
        className="w-full flex items-center gap-3 px-3 py-2.5 disabled:cursor-default"
      >
        <span className={`material-icons-round text-[18px] ${enabled ? 'text-primary' : 'text-white/30'}`}>
          {icon}
        </span>
        <span className={`flex-1 text-left text-sm font-medium ${enabled ? 'text-white' : 'text-white/55'}`}>
          {title}
        </span>
        {stub ? (
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/25 border border-white/10 rounded px-1.5 py-0.5">
            Soon
          </span>
        ) : (
          /* Toggle switch */
          <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-primary' : 'bg-white/15'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
              enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`} />
          </div>
        )}
      </button>
      {enabled && !stub && children && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-white/5 mt-0">
          <div className="pt-2.5 space-y-3">{children}</div>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</span>
        <span className="text-[11px] text-white/55 tabular-nums">{Number.isInteger(step) ? value : value.toFixed(2)}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface EffectsPanelProps {
  imageData: string;
  imageWidth: number;
  imageHeight: number;
  onApply: (result: string) => void;
  onClose: () => void;
}

type Tab = 'color' | 'tone' | 'stylize' | 'artistic';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'color',    label: 'Color',    icon: 'palette' },
  { id: 'tone',     label: 'Tone',     icon: 'tune' },
  { id: 'stylize',  label: 'Stylize',  icon: 'auto_fix_high' },
  { id: 'artistic', label: 'Artistic', icon: 'brush' },
];

export const EffectsPanel = ({ imageData, imageWidth, imageHeight, onApply, onClose }: EffectsPanelProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('color');
  const [effects, setEffects] = useState<EffectsState>(DEFAULT);
  const [isApplying, setIsApplying] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const srcImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Generic updater
  const update = useCallback(<K extends keyof EffectsState>(key: K, patch: Partial<EffectsState[K]>) => {
    setEffects(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const toggle = useCallback((key: keyof EffectsState) => {
    setEffects(prev => ({ ...prev, [key]: { ...prev[key], enabled: !(prev[key] as { enabled: boolean }).enabled } }));
  }, []);

  // Load source image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => { srcImgRef.current = img; scheduleRedraw(); };
    img.src = imageData;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData]);

  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const img = srcImgRef.current;
    if (!canvas || !img) return;

    const MAX = 560;
    const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);

    const id = ctx.getImageData(0, 0, w, h);
    const modified = applyAllEffects(id.data, w, h, effects);
    ctx.putImageData(new ImageData(modified, w, h), 0, 0);
  }, [effects]);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(drawPreview);
  }, [drawPreview]);

  useEffect(() => { scheduleRedraw(); }, [effects, scheduleRedraw]);

  // Apply at full resolution
  const handleApply = useCallback(() => {
    setIsApplying(true);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || imageWidth;
      const h = img.naturalHeight || imageHeight;
      const oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      const ctx = oc.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      const modified = applyAllEffects(id.data, w, h, effects);
      ctx.putImageData(new ImageData(modified, w, h), 0, 0);
      onApply(oc.toDataURL('image/png'));
      setIsApplying(false);
    };
    img.src = imageData;
  }, [effects, imageData, imageWidth, imageHeight, onApply]);

  // Count active effects for badge
  const activeCount = Object.values(effects).filter((v: any) => v.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080c14]/95 backdrop-blur-md">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-14 flex items-center justify-between px-5 border-b border-white/8 bg-[#080c14]/80 backdrop-blur-sm">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-white/55 hover:text-white transition-colors text-sm"
        >
          <span className="material-icons-round text-base">arrow_back</span>
          Cancel
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Effects</span>
          {activeCount > 0 && (
            <span className="text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 rounded-full px-2 py-0.5">
              {activeCount}
            </span>
          )}
        </div>

        <button
          onClick={handleApply}
          disabled={isApplying}
          className="flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isApplying && (
            <span className="material-icons-round text-base animate-spin text-sm">sync</span>
          )}
          Apply Effects
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Preview */}
        <div className="flex-1 flex items-center justify-center p-8 bg-[#060a10]">
          <canvas
            ref={previewCanvasRef}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10"
          />
        </div>

        {/* Side panel */}
        <div className="w-72 flex-shrink-0 border-l border-white/8 bg-[#0d1220] flex flex-col">

          {/* Tab bar */}
          <div className="flex-shrink-0 flex border-b border-white/8">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-white/35 border-transparent hover:text-white/55'
                }`}
              >
                <span className="material-icons-round text-[18px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Effect cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">

            {/* ── Color tab ──────────────────────────────────────── */}
            {activeTab === 'color' && (
              <>
                <EffectCard
                  icon="brightness_6"
                  title="Brightness / Contrast"
                  enabled={effects.brightnessContrast.enabled}
                  onToggle={() => toggle('brightnessContrast')}
                >
                  <Slider label="Brightness" value={effects.brightnessContrast.brightness}
                    min={-100} max={100}
                    onChange={v => update('brightnessContrast', { brightness: v })} />
                  <Slider label="Contrast" value={effects.brightnessContrast.contrast}
                    min={-100} max={100}
                    onChange={v => update('brightnessContrast', { contrast: v })} />
                </EffectCard>

                <EffectCard
                  icon="invert_colors"
                  title="Hue / Saturation"
                  enabled={effects.hueSaturation.enabled}
                  onToggle={() => toggle('hueSaturation')}
                >
                  <Slider label="Hue" value={effects.hueSaturation.hue}
                    min={-180} max={180} unit="°"
                    onChange={v => update('hueSaturation', { hue: v })} />
                  <Slider label="Saturation" value={effects.hueSaturation.saturation}
                    min={-100} max={100}
                    onChange={v => update('hueSaturation', { saturation: v })} />
                </EffectCard>

                <EffectCard
                  icon="thermostat"
                  title="Temperature / Tint"
                  enabled={effects.temperatureTint.enabled}
                  onToggle={() => toggle('temperatureTint')}
                >
                  <Slider label="Temperature" value={effects.temperatureTint.temperature}
                    min={-100} max={100}
                    onChange={v => update('temperatureTint', { temperature: v })} />
                  <Slider label="Tint" value={effects.temperatureTint.tint}
                    min={-100} max={100}
                    onChange={v => update('temperatureTint', { tint: v })} />
                </EffectCard>

                <EffectCard
                  icon="exposure"
                  title="Exposure"
                  enabled={effects.exposure.enabled}
                  onToggle={() => toggle('exposure')}
                >
                  <Slider label="EV" value={effects.exposure.value}
                    min={-3} max={3} step={0.05} unit=" EV"
                    onChange={v => update('exposure', { value: v })} />
                </EffectCard>

                <EffectCard
                  icon="settings_brightness"
                  title="Gamma"
                  enabled={effects.gamma.enabled}
                  onToggle={() => toggle('gamma')}
                >
                  <Slider label="Gamma" value={effects.gamma.value}
                    min={0.1} max={3.0} step={0.05}
                    onChange={v => update('gamma', { value: v })} />
                </EffectCard>
              </>
            )}

            {/* ── Tone tab ───────────────────────────────────────── */}
            {activeTab === 'tone' && (
              <>
                <EffectCard
                  icon="vignette"
                  title="Vignette"
                  enabled={effects.vignette.enabled}
                  onToggle={() => toggle('vignette')}
                >
                  <Slider label="Strength" value={effects.vignette.strength}
                    min={0} max={100}
                    onChange={v => update('vignette', { strength: v })} />
                  <Slider label="Radius" value={effects.vignette.radius}
                    min={0} max={100}
                    onChange={v => update('vignette', { radius: v })} />
                </EffectCard>

                <EffectCard icon="equalizer" title="Levels"
                  enabled={effects.levels.enabled} onToggle={() => toggle('levels')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="show_chart" title="Curves"
                  enabled={effects.curves.enabled} onToggle={() => toggle('curves')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="wb_twilight" title="Shadow / Highlight"
                  enabled={effects.shadowHighlight.enabled} onToggle={() => toggle('shadowHighlight')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="hdr_on" title="HDR"
                  enabled={effects.hdr.enabled} onToggle={() => toggle('hdr')} stub>
                  {null}
                </EffectCard>
              </>
            )}

            {/* ── Stylize tab ────────────────────────────────────── */}
            {activeTab === 'stylize' && (
              <>
                <EffectCard
                  icon="blur_on"
                  title="Gaussian Blur"
                  enabled={effects.blur.enabled}
                  onToggle={() => toggle('blur')}
                >
                  <Slider label="Radius" value={effects.blur.radius}
                    min={0.5} max={20} step={0.5} unit="px"
                    onChange={v => update('blur', { radius: v })} />
                </EffectCard>

                <EffectCard
                  icon="photo_filter"
                  title="Sharpen"
                  enabled={effects.sharpen.enabled}
                  onToggle={() => toggle('sharpen')}
                >
                  <Slider label="Amount" value={effects.sharpen.amount}
                    min={0} max={100}
                    onChange={v => update('sharpen', { amount: v })} />
                </EffectCard>

                <EffectCard
                  icon="grid_on"
                  title="Pixelate"
                  enabled={effects.pixelate.enabled}
                  onToggle={() => toggle('pixelate')}
                >
                  <Slider label="Block Size" value={effects.pixelate.size}
                    min={2} max={64} unit="px"
                    onChange={v => update('pixelate', { size: v })} />
                </EffectCard>

                <EffectCard icon="motion_photos_on" title="Motion Blur"
                  enabled={effects.motionBlur.enabled} onToggle={() => toggle('motionBlur')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="blur_circular" title="Directional Blur"
                  enabled={effects.dirBlur.enabled} onToggle={() => toggle('dirBlur')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="gradient" title="Posterize"
                  enabled={effects.posterize.enabled} onToggle={() => toggle('posterize')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="texture" title="Emboss"
                  enabled={effects.emboss.enabled} onToggle={() => toggle('emboss')} stub>
                  {null}
                </EffectCard>
              </>
            )}

            {/* ── Artistic tab ───────────────────────────────────── */}
            {activeTab === 'artistic' && (
              <>
                <p className="text-[10px] text-white/25 text-center py-1 tracking-wide">
                  AI-powered artistic filters — coming soon
                </p>
                <EffectCard icon="draw" title="Sketch"
                  enabled={effects.sketch.enabled} onToggle={() => toggle('sketch')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="face_retouching_natural" title="Cartoon"
                  enabled={effects.cartoon.enabled} onToggle={() => toggle('cartoon')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="water_drop" title="Watercolor"
                  enabled={effects.watercolor.enabled} onToggle={() => toggle('watercolor')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="blur_circular" title="Halftone"
                  enabled={effects.halftone.enabled} onToggle={() => toggle('halftone')} stub>
                  {null}
                </EffectCard>
                <EffectCard icon="format_ink_highlighter" title="Ink Outline"
                  enabled={effects.inkOutline.enabled} onToggle={() => toggle('inkOutline')} stub>
                  {null}
                </EffectCard>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default EffectsPanel;
