interface BottomActionBarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  diffusionPrompt?: string;
  onDiffusionClick?: () => void;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

export const BottomActionBar = ({
  onUndo,
  onRedo,
  diffusionPrompt: _diffusionPrompt = '',
  onDiffusionClick,
  zoomLevel = 1,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: BottomActionBarProps) => {
  return (
    <footer className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel px-6 py-3 rounded-full thin-border flex items-center gap-6 z-30 shadow-2xl">
      {/* Undo */}
      <button
        onClick={onUndo}
        className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
      >
        <span className="material-icons-round text-lg">undo</span>
        <span className="text-[10px] font-bold tracking-tighter uppercase">Undo</span>
      </button>

      <div className="h-4 w-px bg-white/10" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onZoomOut}
          className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Zoom Out"
        >
          <span className="material-icons-round text-sm">remove</span>
        </button>
        <button
          onClick={onResetZoom}
          className="px-2 py-1 rounded-md bg-white/5 text-[10px] font-bold text-white/70 hover:text-white hover:bg-white/10 transition-colors min-w-[50px]"
          title="Reset Zoom"
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Zoom In"
        >
          <span className="material-icons-round text-sm">add</span>
        </button>
      </div>

      <div className="h-4 w-px bg-white/10" />

      {/* Diffusion Prompt */}
      <button onClick={onDiffusionClick} className="flex items-center gap-3 group">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40 group-hover:scale-110 transition-transform">
          <span className="material-icons-round text-white text-lg">auto_awesome</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[10px] font-bold text-white">Diffusion</span>
        </div>
      </button>

      <div className="h-4 w-px bg-white/10" />

      {/* Redo */}
      <button
        onClick={onRedo}
        className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
      >
        <span className="text-[10px] font-bold tracking-tighter uppercase">Redo</span>
        <span className="material-icons-round text-lg">redo</span>
      </button>
    </footer>
  );
};
