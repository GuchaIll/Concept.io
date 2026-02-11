import { useState, useCallback, useRef, useEffect } from 'react';
import type { RGBAColor } from '../../hooks/Color';

interface ColorPaletteProps {
  currentColor: RGBAColor;
  onColorChange: (color: RGBAColor) => void;
  onClose: () => void;
}

type HarmonyScheme = 'monochromatic' | 'analogous' | 'complementary' | 'split-complementary' | 'triadic' | 'tetradic';

// Helper functions for color conversion
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
};

export const ColorPalette = ({ currentColor, onColorChange, onClose }: ColorPaletteProps) => {
  const [hue, setHue] = useState(() => {
    const [h] = rgbToHsl(currentColor.r, currentColor.g, currentColor.b);
    return h;
  });
  const [saturation, setSaturation] = useState(() => {
    const [, s] = rgbToHsl(currentColor.r, currentColor.g, currentColor.b);
    return s;
  });
  const [lightness, setLightness] = useState(() => {
    const [, , l] = rgbToHsl(currentColor.r, currentColor.g, currentColor.b);
    return l;
  });
  
  const [harmonyScheme, setHarmonyScheme] = useState<HarmonyScheme>('complementary');
  const [saturationBias, setSaturationBias] = useState(65);
  const [luminanceRange, setLuminanceRange] = useState(80);
  const [contrastCurve, setContrastCurve] = useState(40);
  
  const wheelRef = useRef<HTMLDivElement>(null);
  const diamondRef = useRef<HTMLDivElement>(null);
  const [isDraggingWheel, setIsDraggingWheel] = useState(false);
  const [isDraggingDiamond, setIsDraggingDiamond] = useState(false);

  // Update color when HSL changes
  useEffect(() => {
    const [r, g, b] = hslToRgb(hue, saturation, lightness);
    onColorChange({ r, g, b, a: 1 });
  }, [hue, saturation, lightness, onColorChange]);

  // Handle wheel interaction for hue
  const handleWheelInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    let newHue = (angle * 180 / Math.PI + 90 + 360) % 360;
    setHue(newHue);
  }, []);

  // Handle diamond interaction for saturation/lightness
  const handleDiamondInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!diamondRef.current) return;
    const rect = diamondRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setSaturation(x * 100);
    setLightness((1 - y) * 100);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingWheel) handleWheelInteraction(e);
      if (isDraggingDiamond) handleDiamondInteraction(e);
    };
    const handleMouseUp = () => {
      setIsDraggingWheel(false);
      setIsDraggingDiamond(false);
    };
    
    if (isDraggingWheel || isDraggingDiamond) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingWheel, isDraggingDiamond, handleWheelInteraction, handleDiamondInteraction]);

  // Generate harmony colors - matching the image layout (2 rows of colors)
  const getHarmonyColors = useCallback(() => {
    const colors: string[] = [];
    const mainColor = rgbToHex(...hslToRgb(hue, saturation, lightness));
    
    switch (harmonyScheme) {
      case 'complementary':
        // Row 1: Orange variations
        colors.push(rgbToHex(...hslToRgb(hue, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation * 0.9, lightness * 1.1)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation * 0.8, lightness * 0.9)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation, lightness * 1.2)));
        // Row 2: Blue variations (complementary)
        colors.push(rgbToHex(...hslToRgb((hue + 180) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb((hue + 180) % 360, saturation * 0.9, lightness * 0.8)));
        colors.push(rgbToHex(...hslToRgb((hue + 180) % 360, saturation * 0.8, lightness * 0.6)));
        colors.push(rgbToHex(...hslToRgb((hue + 180) % 360, saturation, lightness * 1.1)));
        break;
      case 'analogous':
        colors.push(mainColor);
        colors.push(rgbToHex(...hslToRgb((hue + 30) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb((hue - 30 + 360) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb((hue + 60) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb((hue - 60 + 360) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation * 0.7, lightness)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation, lightness * 0.7)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation * 0.5, lightness * 1.2)));
        break;
      case 'triadic':
        colors.push(mainColor);
        colors.push(rgbToHex(...hslToRgb((hue + 120) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb((hue + 240) % 360, saturation, lightness)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation * 0.7, lightness * 1.2)));
        colors.push(rgbToHex(...hslToRgb((hue + 120) % 360, saturation * 0.7, lightness)));
        colors.push(rgbToHex(...hslToRgb((hue + 240) % 360, saturation * 0.7, lightness)));
        colors.push(rgbToHex(...hslToRgb(hue, saturation, lightness * 0.6)));
        colors.push(rgbToHex(...hslToRgb((hue + 120) % 360, saturation, lightness * 0.6)));
        break;
      default:
        colors.push(mainColor);
        for (let i = 1; i < 8; i++) {
          colors.push(rgbToHex(...hslToRgb(hue, saturation * (1 - i * 0.1), lightness * (0.5 + i * 0.1))));
        }
    }
    return colors;
  }, [hue, saturation, lightness, harmonyScheme]);

  // Generate shading swatches - 3 rows of 5 colors each
  const generateSwatches = useCallback(() => {
    const swatches: string[] = [];
    // Row 1: Main color shades (dark to light)
    for (let i = 0; i < 5; i++) {
      const l = 15 + (i * 18) * (luminanceRange / 100);
      const s = saturation * (1 + (saturationBias - 50) / 100);
      swatches.push(rgbToHex(...hslToRgb(hue, Math.min(100, s), Math.min(95, l))));
    }
    // Row 2: Complementary shades
    const compHue = (hue + 180) % 360;
    for (let i = 0; i < 5; i++) {
      const l = 10 + (i * 18) * (luminanceRange / 100);
      swatches.push(rgbToHex(...hslToRgb(compHue, saturation * 0.9, Math.min(90, l))));
    }
    // Row 3: Neutral shades
    swatches.push('#FFFFFF');
    swatches.push('#94A3B8');
    swatches.push('#475569');
    swatches.push('#1E293B');
    swatches.push('#0F172A');
    return swatches;
  }, [hue, saturation, luminanceRange, saturationBias]);

  const selectedHex = rgbToHex(currentColor.r, currentColor.g, currentColor.b);
  const harmonyColors = getHarmonyColors();
  const swatches = generateSwatches();

  // Calculate hue indicator position on wheel
  const hueAngle = (hue - 90) * Math.PI / 180;
  const wheelRadius = 90; // For 200px wheel
  const hueX = Math.cos(hueAngle) * wheelRadius;
  const hueY = Math.sin(hueAngle) * wheelRadius;

  return (
    <aside className="absolute left-20 top-1/2 -translate-y-1/2 z-50">
      <div 
        className="w-[520px] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{ 
          background: 'rgba(10, 12, 16, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        {/* Header */}
        <header className="px-4 py-3 flex justify-between items-center border-b border-white/10">
          <div>
            <h1 className="text-sm font-bold tracking-tight">Smart Palette</h1>
            <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
              Color Harmony
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex overflow-hidden">
          {/* Left: Color Wheel */}
          <section className="flex-1 p-4 flex flex-col items-center justify-center relative" style={{ background: '#0a0c10' }}>
            {/* Color Wheel */}
            <div 
              ref={wheelRef}
              className="relative w-[200px] h-[200px] flex items-center justify-center cursor-crosshair"
              onMouseDown={(e) => { setIsDraggingWheel(true); handleWheelInteraction(e); }}
            >
              {/* Outer color wheel ring */}
              <div 
                className="absolute inset-0 rounded-full"
                style={{ 
                  background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                  boxShadow: '0 0 30px rgba(0,0,0,0.4)'
                }}
              />
              
              {/* Inner dark circle */}
              <div 
                className="absolute rounded-full flex items-center justify-center"
                style={{ width: '160px', height: '160px', background: '#0a0c10' }}
              >
                {/* Diamond picker for saturation/lightness */}
                <div
                  ref={diamondRef}
                  className="w-24 h-24 rounded-sm shadow-2xl relative overflow-hidden cursor-crosshair"
                  style={{ 
                    transform: 'rotate(45deg)',
                    background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)`,
                    backgroundColor: `hsl(${hue}, 100%, 50%)`
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); setIsDraggingDiamond(true); handleDiamondInteraction(e); }}
                >
                  {/* Center indicator */}
                  <div 
                    className="absolute w-2.5 h-2.5 rounded-full border-2 border-white shadow-lg pointer-events-none"
                    style={{
                      left: `${saturation}%`,
                      top: `${100 - lightness}%`,
                      transform: 'translate(-50%, -50%) rotate(-45deg)',
                      backgroundColor: selectedHex
                    }}
                  />
                </div>
              </div>

              {/* Hue indicator on wheel */}
              <div 
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-2xl z-30 pointer-events-none"
                style={{ 
                  transform: `translate(${hueX}px, ${hueY}px)`,
                  backgroundColor: `hsl(${hue}, 100%, 50%)`
                }}
              />
            </div>

            {/* Selected Color Info */}
            <div className="mt-3 flex items-center gap-3 bg-white/5 px-3 py-2 rounded-lg border border-white/10">
              <div 
                className="w-8 h-8 rounded-md shadow-lg"
                style={{ 
                  backgroundColor: selectedHex,
                  boxShadow: `0 0 10px ${selectedHex}30`
                }}
              />
              <div>
                <p className="text-[8px] text-slate-500 uppercase font-bold">Selected</p>
                <p className="text-xs font-mono font-bold">{selectedHex}</p>
              </div>
            </div>
          </section>

          {/* Right: Controls */}
          <aside className="w-[240px] flex flex-col overflow-y-auto border-l border-white/10" style={{ background: '#12151a' }}>
            <div className="p-3 space-y-4">
              {/* Harmony Scheme */}
              <section className="space-y-2">
                <label className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Harmony</label>
                <select 
                  value={harmonyScheme}
                  onChange={(e) => setHarmonyScheme(e.target.value as HarmonyScheme)}
                  className="w-full bg-[#0a0c10] border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-medium focus:ring-1 focus:ring-primary focus:border-transparent outline-none cursor-pointer"
                >
                  <option value="monochromatic">Monochromatic</option>
                  <option value="analogous">Analogous</option>
                  <option value="complementary">Complementary</option>
                  <option value="split-complementary">Split-Complementary</option>
                  <option value="triadic">Triadic</option>
                  <option value="tetradic">Tetradic</option>
                </select>
                {/* Harmony Colors - 2 rows of 4 */}
                <div className="grid grid-cols-4 gap-1 pt-1">
                  {harmonyColors.slice(0, 8).map((color, i) => (
                    <button
                      key={i}
                      className={`aspect-square rounded transition-all hover:scale-105 ${i === 0 ? 'ring-1 ring-primary ring-offset-1 ring-offset-[#12151a]' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        const hex = color.slice(1);
                        const r = parseInt(hex.slice(0, 2), 16);
                        const g = parseInt(hex.slice(2, 4), 16);
                        const b = parseInt(hex.slice(4, 6), 16);
                        onColorChange({ r, g, b, a: 1 });
                      }}
                    />
                  ))}
                </div>
              </section>

              <div className="h-px bg-white/10" />

              {/* Generated Swatches */}
              <section className="space-y-2">
                <label className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Swatches</label>
                <div className="grid grid-cols-5 gap-1">
                  {swatches.map((color, i) => (
                    <button
                      key={i}
                      className="aspect-square rounded transition-all hover:scale-105 hover:ring-1 hover:ring-white/30"
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        const hex = color.slice(1);
                        const r = parseInt(hex.slice(0, 2), 16);
                        const g = parseInt(hex.slice(2, 4), 16);
                        const b = parseInt(hex.slice(4, 6), 16);
                        onColorChange({ r, g, b, a: 1 });
                      }}
                    />
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </main>

        {/* Footer */}
        <div className="p-3 bg-white/[0.02] border-t border-white/5">
          <button 
            onClick={onClose}
            className="w-full py-2 bg-primary text-white rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all hover:brightness-110 shadow-lg shadow-primary/20"
          >
            Apply Color
          </button>
        </div>
      </div>
    </aside>
  );
};
