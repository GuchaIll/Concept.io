import { useState } from 'react';
import type { useBrush } from '../../hooks/Brush';

interface BrushEditorProps {
  brushProps: ReturnType<typeof useBrush>;
  onClose: () => void;
}

type BrushLibraryItem = {
  id: string;
  icon: string;
  label: string;
};

const brushLibrary: BrushLibraryItem[] = [
  { id: 'Pencil', icon: 'edit', label: 'Pencil' },
  { id: 'Circle', icon: 'brush', label: 'Circle Brush' },
  { id: 'Spray', icon: 'air', label: 'Spray' },
  { id: 'texture', icon: 'texture', label: 'Texture' },
  { id: 'hline', icon: 'radio_button_unchecked', label: 'H-Line' },
  { id: 'vline', icon: 'grid_view', label: 'V-Line' },
  { id: 'square', icon: 'crop_square', label: 'Square' },
  { id: 'diamond', icon: 'hexagon', label: 'Diamond' },
  { id: 'image', icon: 'image', label: 'Image' },
  { id: 'ink', icon: 'ink_pen', label: 'Ink Pen' },
  { id: 'watercolor', icon: 'water', label: 'Watercolor' },
  { id: 'marker', icon: 'draw', label: 'Marker' },
  { id: 'blur', icon: 'blur_on', label: 'Blur' },
  { id: 'cloud', icon: 'cloud', label: 'Cloud' },
  { id: 'palette', icon: 'palette', label: 'Palette' },
  { id: 'gesture', icon: 'gesture', label: 'Gesture' },
  { id: 'category', icon: 'category', label: 'Category' },
  { id: 'calligraphy', icon: 'history_edu', label: 'Calligraphy' },
  { id: 'waves', icon: 'waves', label: 'Waves' },
  { id: 'star', icon: 'star_outline', label: 'Star' },
];

export const BrushEditor = ({ brushProps, onClose }: BrushEditorProps) => {
  const { 
    brushType, 
    setBrushType, 
    lineWidth, 
    setLineWidth, 
    brushOpacity, 
    setBrushOpacity 
  } = brushProps;

  const [tipAngle, setTipAngle] = useState(45);
  const [tipRoundness, setTipRoundness] = useState(80);
  const [hardness, setHardness] = useState(20);
  const [spacing, setSpacing] = useState(15);

  return (
    <aside className="absolute left-20 top-1/2 -translate-y-1/2 w-[480px] z-50">
      <div 
        className="h-[600px] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: 'rgba(16, 22, 34, 0.95)',
          backdropFilter: 'blur(25px)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {/* Header */}
        <div className="p-5 flex items-center justify-between border-b border-white/5">
          <div className="flex flex-col">
            <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50">
              Advanced Editor
            </h2>
            <span className="text-sm font-semibold">
              {brushLibrary.find(b => b.id === brushType)?.label || 'Pencil'} Selection
            </span>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Brush Library */}
          <div className="w-[180px] border-r border-white/5 flex flex-col">
            <div className="px-4 py-3 bg-white/[0.02]">
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Library</p>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-3">
              <div className="grid grid-cols-4 gap-2">
                {brushLibrary.map((brush) => (
                  <button
                    key={brush.id}
                    onClick={() => setBrushType(brush.id)}
                    className={`aspect-square rounded-lg flex items-center justify-center transition-colors ${
                      brushType === brush.id
                        ? 'bg-primary border border-primary shadow-lg shadow-primary/20'
                        : 'bg-white/5 border border-white/5 hover:bg-white/10'
                    }`}
                    title={brush.label}
                  >
                    <span className={`material-symbols-outlined text-base ${
                      brushType === brush.id ? 'text-white' : 'text-white/40'
                    }`}>
                      {brush.icon}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Settings */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tip Shape Editor */}
            <div className="h-1/2 border-b border-white/5 p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                  Tip Shape
                </label>
                <span className="text-[9px] text-white/60 bg-white/10 px-2 py-0.5 rounded">
                  {tipAngle}° / {tipRoundness}%
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center relative">
                {/* Guide circles */}
                <div className="absolute w-32 h-32 rounded-full border border-dashed border-white/10" />
                <div className="absolute w-px h-32 bg-white/5" />
                <div className="absolute h-px w-32 bg-white/5" />
                
                {/* Tip Shape Preview */}
                <div 
                  className="w-28 h-12 rounded-[100%] border-2 border-primary bg-primary/10 flex items-center justify-center relative cursor-move group"
                  style={{ 
                    transform: `rotate(${tipAngle}deg)`,
                    boxShadow: '0 0 30px rgba(43,108,238,0.15)'
                  }}
                >
                  {/* Control handles */}
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-primary cursor-ns-resize hover:scale-125 transition-transform" />
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-primary cursor-ns-resize hover:scale-125 transition-transform" />
                  <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-2 bg-white/50 rounded-full" />
                  <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-2 bg-white/50 rounded-full" />
                </div>
              </div>
            </div>

            {/* Sliders */}
            <div className="h-1/2 overflow-y-auto no-scrollbar p-6">
              <div className="space-y-5">
                {/* Size */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                      Size
                    </label>
                    <span className="text-[10px] text-white/80 font-medium">{lineWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={lineWidth}
                    onChange={(e) => setLineWidth(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Opacity */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                      Opacity
                    </label>
                    <span className="text-[10px] text-white/80 font-medium">
                      {Math.round(brushOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={brushOpacity * 100}
                    onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Hardness */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                      Hardness
                    </label>
                    <span className="text-[10px] text-white/80 font-medium">{hardness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={hardness}
                    onChange={(e) => setHardness(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Spacing */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                      Spacing
                    </label>
                    <span className="text-[10px] text-white/80 font-medium">{spacing}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={spacing}
                    onChange={(e) => setSpacing(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-white/[0.02] border-t border-white/5">
          <button 
            onClick={onClose}
            className="w-full py-3.5 bg-primary text-white rounded-xl text-[10px] font-bold tracking-[0.2em] uppercase transition-all hover:brightness-110 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            Apply Brush Settings
          </button>
        </div>
      </div>
    </aside>
  );
};
