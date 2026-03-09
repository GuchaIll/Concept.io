import { useState } from 'react';
import type { ISnapshot, ILayerSnapshot } from '../../types/version.interface';

interface DiffViewerProps {
  snapshotA: ISnapshot;
  snapshotB: ISnapshot;
  onClose: () => void;
}

type DiffMode = 'sideBySide' | 'overlay' | 'slider';

interface LayerDiff {
  layerId: string;
  name: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  layerA?: ILayerSnapshot;
  layerB?: ILayerSnapshot;
}

// Compare two snapshots and return layer diffs
const compareSnapshots = (a: ISnapshot, b: ISnapshot): LayerDiff[] => {
  const diffs: LayerDiff[] = [];
  const layerMapA = new Map(a.layers.map(l => [l.layerId, l]));
  const layerMapB = new Map(b.layers.map(l => [l.layerId, l]));
  
  // Check layers in A
  for (const [layerId, layerA] of layerMapA) {
    const layerB = layerMapB.get(layerId);
    if (!layerB) {
      diffs.push({ layerId, name: layerA.name, status: 'removed', layerA });
    } else if (layerA.objects !== layerB.objects || 
               layerA.visible !== layerB.visible || 
               layerA.opacity !== layerB.opacity) {
      diffs.push({ layerId, name: layerA.name, status: 'modified', layerA, layerB });
    } else {
      diffs.push({ layerId, name: layerA.name, status: 'unchanged', layerA, layerB });
    }
  }
  
  // Check for new layers in B
  for (const [layerId, layerB] of layerMapB) {
    if (!layerMapA.has(layerId)) {
      diffs.push({ layerId, name: layerB.name, status: 'added', layerB });
    }
  }
  
  return diffs;
};

const statusColors = {
  added: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  removed: 'text-red-400 bg-red-400/10 border-red-400/30',
  modified: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  unchanged: 'text-white/40 bg-white/5 border-white/10',
};

const statusIcons = {
  added: 'add_circle',
  removed: 'remove_circle',
  modified: 'edit',
  unchanged: 'check_circle',
};

export const DiffViewer = ({
  snapshotA,
  snapshotB,
  onClose,
}: DiffViewerProps) => {
  const [mode, setMode] = useState<DiffMode>('sideBySide');
  const [sliderPosition, setSliderPosition] = useState(50);
  
  const diffs = compareSnapshots(snapshotA, snapshotB);
  const changedCount = diffs.filter(d => d.status !== 'unchanged').length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-dark">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <span className="material-icons">close</span>
          </button>
          <div>
            <h1 className="text-lg font-bold">Visual Diff</h1>
            <p className="text-xs text-white/50">
              Comparing <span className="text-primary">{snapshotA.name}</span> → <span className="text-primary">{snapshotB.name}</span>
            </p>
          </div>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center gap-2 bg-slate-panel rounded-lg p-1">
          {[
            { id: 'sideBySide', icon: 'view_column', label: 'Side by Side' },
            { id: 'overlay', icon: 'layers', label: 'Overlay' },
            { id: 'slider', icon: 'compare', label: 'Slider' },
          ].map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id as DiffMode)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                mode === id ? 'bg-primary text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              <span className="material-icons text-sm">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Image Comparison */}
        <div className="flex-1 relative flex items-center justify-center p-8">
          {mode === 'sideBySide' && (
            <div className="flex gap-4 w-full max-w-6xl">
              <div className="flex-1 flex flex-col items-center gap-4">
                <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Before</span>
                <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-slate-panel">
                  {snapshotA.thumbnail ? (
                    <img src={snapshotA.thumbnail} alt={snapshotA.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <span className="material-icons text-4xl">image</span>
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold">{snapshotA.name}</p>
              </div>
              <div className="flex-1 flex flex-col items-center gap-4">
                <span className="text-xs font-bold text-white/50 uppercase tracking-widest">After</span>
                <div className="w-full aspect-video rounded-xl overflow-hidden border border-primary/30 bg-slate-panel">
                  {snapshotB.thumbnail ? (
                    <img src={snapshotB.thumbnail} alt={snapshotB.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <span className="material-icons text-4xl">image</span>
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold">{snapshotB.name}</p>
              </div>
            </div>
          )}
          
          {mode === 'overlay' && (
            <div className="relative max-w-4xl w-full aspect-video rounded-xl overflow-hidden border border-white/10">
              {snapshotA.thumbnail && (
                <img src={snapshotA.thumbnail} alt={snapshotA.name} className="absolute inset-0 w-full h-full object-contain" />
              )}
              {snapshotB.thumbnail && (
                <img src={snapshotB.thumbnail} alt={snapshotB.name} className="absolute inset-0 w-full h-full object-contain opacity-50 mix-blend-difference" />
              )}
            </div>
          )}
          
          {mode === 'slider' && (
            <div className="relative max-w-4xl w-full aspect-video rounded-xl overflow-hidden border border-white/10">
              {snapshotA.thumbnail && (
                <img src={snapshotA.thumbnail} alt={snapshotA.name} className="absolute inset-0 w-full h-full object-contain" />
              )}
              {snapshotB.thumbnail && (
                <div 
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                >
                  <img src={snapshotB.thumbnail} alt={snapshotB.name} className="w-full h-full object-contain" />
                </div>
              )}
              {/* Slider Handle */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="material-icons text-white text-sm">drag_indicator</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPosition}
                onChange={(e) => setSliderPosition(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
              />
            </div>
          )}
        </div>

        {/* Layer Diff Panel */}
        <aside className="w-80 border-l border-white/10 flex flex-col">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">Layer Changes</h3>
            <p className="text-sm text-white/80 mt-1">{changedCount} layer(s) changed</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {diffs.map((diff) => (
              <div
                key={diff.layerId}
                className={`p-3 rounded-lg border ${statusColors[diff.status]}`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-icons text-sm">{statusIcons[diff.status]}</span>
                  <span className="text-sm font-medium">{diff.name}</span>
                </div>
                <p className="text-[10px] uppercase tracking-widest mt-1 opacity-60">
                  {diff.status === 'added' && 'New layer added'}
                  {diff.status === 'removed' && 'Layer removed'}
                  {diff.status === 'modified' && 'Content modified'}
                  {diff.status === 'unchanged' && 'No changes'}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
