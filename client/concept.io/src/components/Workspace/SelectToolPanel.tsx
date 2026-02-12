
export type SelectionMode = 'box' | 'lasso' | 'magic';

interface SelectToolPanelProps {
  activeMode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
  magicThreshold: number;
  onThresholdChange: (threshold: number) => void;
  onClose: () => void;
}

const selectionModes = [
  { 
    id: 'box' as SelectionMode, 
    icon: 'select_all', 
    label: 'Box Select',
    description: 'Rectangular selection'
  },
  { 
    id: 'lasso' as SelectionMode, 
    icon: 'gesture', 
    label: 'Lasso Select',
    description: 'Freehand selection'
  },
  { 
    id: 'magic' as SelectionMode, 
    icon: 'auto_fix_high', 
    label: 'Magic Select',
    description: 'Auto-select by color'
  },
];

export const SelectToolPanel = ({
  activeMode,
  onModeChange,
  magicThreshold,
  onThresholdChange,
  onClose,
}: SelectToolPanelProps) => {
  return (
    <aside className="absolute left-20 top-1/2 -translate-y-1/2 z-50">
      <div 
        className="w-[200px] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{ 
          background: 'rgba(10, 12, 16, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        {/* Header */}
        <header className="px-4 py-3 flex justify-between items-center border-b border-white/10">
          <div>
            <h1 className="text-sm font-bold tracking-tight">Selection Tool</h1>
            <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
              Choose mode
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white/30 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <span className="material-icons-round text-sm">close</span>
          </button>
        </header>

        {/* Selection Modes */}
        <div className="p-3 space-y-2">
          {selectionModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                activeMode === mode.id 
                  ? 'bg-primary/20 border border-primary/50' 
                  : 'bg-white/5 border border-transparent hover:bg-white/10'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                activeMode === mode.id ? 'bg-primary text-white' : 'bg-white/10 text-white/60'
              }`}>
                <span className="material-icons-round text-lg">{mode.icon}</span>
              </div>
              <div className="text-left">
                <p className={`text-xs font-semibold ${activeMode === mode.id ? 'text-primary' : 'text-white'}`}>
                  {mode.label}
                </p>
                <p className="text-[9px] text-white/40">{mode.description}</p>
              </div>
              {activeMode === mode.id && (
                <span className="material-icons-round text-primary text-sm ml-auto">check</span>
              )}
            </button>
          ))}
        </div>

        {/* Magic Select Threshold - only show when magic mode is active */}
        {activeMode === 'magic' && (
          <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-bold text-white/50 uppercase tracking-widest">
                Color Threshold
              </label>
              <span className="text-[10px] text-white/70 font-mono">{magicThreshold}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={magicThreshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <p className="text-[8px] text-white/30">
              Higher values select more similar colors
            </p>
          </div>
        )}

        {/* Keyboard Shortcut Hint */}
        <div className="px-4 py-3 bg-white/[0.02] border-t border-white/5">
          <div className="flex items-center gap-2 text-[9px] text-white/40">
            <span className="material-icons-round text-xs">keyboard</span>
            <span>Hold <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/60">Shift</kbd> to add to selection</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
