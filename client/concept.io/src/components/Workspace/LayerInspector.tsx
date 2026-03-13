import { useState, useCallback } from 'react';
import type { Layer, LayerType, BlendMode } from '../../hooks/Layer';
import { LayerTypes, blendModes } from '../../hooks/Layer';
import { getLayerConstraints } from '../../config/layerConstraints';

interface LayerInspectorProps {
  layer: Layer;
  onNameChange?: (layerId: string, name: string) => void;
  onTypeChange?: (layerId: string, type: LayerType) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
  onBlendModeChange: (layerId: string, blendMode: string) => void;
  onVisibilityChange: (layerId: string, visible: boolean) => void;
  onLockToggle: (layerId: string) => void;
  onRemove?: (layerId: string) => void;
  canRemove?: boolean;
}

export const LayerInspector = ({
  layer,
  onNameChange,
  onTypeChange,
  onOpacityChange,
  onBlendModeChange,
  onVisibilityChange,
  onLockToggle,
  onRemove,
  canRemove = true,
}: LayerInspectorProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const constraints = getLayerConstraints(layer.type);

  const handleNameSubmit = useCallback(() => {
    setIsEditingName(false);
    if (editName.trim() && editName !== layer.name) {
      onNameChange?.(layer.id, editName.trim());
    } else {
      setEditName(layer.name);
    }
  }, [editName, layer.id, layer.name, onNameChange]);

  const blendModeEntries = Object.entries(blendModes).map(([key, value]) => ({
    label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
    value,
  }));

  return (
    <div className="p-4 space-y-4 border-t border-white/5">
      {/* Layer name */}
      <div className="flex items-center justify-between gap-2">
        {isEditingName ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-primary/50"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setEditName(layer.name); setIsEditingName(true); }}
            className="flex-1 text-left text-sm text-white/80 hover:text-white truncate"
            title="Click to rename"
          >
            {layer.name}
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onVisibilityChange(layer.id, !layer.visible)}
            className={`p-1.5 rounded-lg transition-colors ${
              layer.visible ? 'text-white/60 hover:text-white' : 'text-white/20 hover:text-white/40'
            }`}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
          >
            <span className="material-icons-round text-base">
              {layer.visible ? 'visibility' : 'visibility_off'}
            </span>
          </button>
          <button
            onClick={() => onLockToggle(layer.id)}
            className={`p-1.5 rounded-lg transition-colors ${
              layer.locked ? 'text-amber-400 hover:text-amber-300' : 'text-white/60 hover:text-white'
            }`}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          >
            <span className="material-icons-round text-base">
              {layer.locked ? 'lock' : 'lock_open'}
            </span>
          </button>
        </div>
      </div>

      {/* Layer type */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold tracking-widest uppercase text-white/40">Type</label>
        <select
          value={layer.type || 'paint'}
          onChange={(e) => onTypeChange?.(layer.id, e.target.value as LayerType)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-primary/50"
        >
          {LayerTypes.map((type) => (
            <option key={type.value} value={type.value} className="bg-gray-800">
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Opacity slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold tracking-widest uppercase text-white/40">Opacity</label>
          <span className="text-xs text-white/50">{Math.round(layer.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => onOpacityChange(layer.id, Number(e.target.value) / 100)}
          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
        />
      </div>

      {/* Blend mode - only for paint layers */}
      {constraints.allowDrawing && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold tracking-widest uppercase text-white/40">Blend Mode</label>
          <select
            value={layer.blendMode || 'normal'}
            onChange={(e) => onBlendModeChange(layer.id, e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-primary/50"
          >
            {blendModeEntries.map((mode) => (
              <option key={mode.value} value={mode.value} className="bg-gray-800">
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Constraint info badge */}
      {!constraints.allowDrawing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <span className="material-icons-round text-amber-400 text-sm">info</span>
          <span className="text-xs text-amber-400/80">
            Drawing disabled — {layer.type} layer
          </span>
        </div>
      )}

      {layer.locked && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <span className="material-icons-round text-amber-400 text-sm">lock</span>
          <span className="text-xs text-amber-400/80">
            Layer is locked — edits disabled
          </span>
        </div>
      )}

      {/* Dirty state indicator */}
      {layer.isDirty && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <span className="material-icons-round text-blue-400 text-sm">edit</span>
          <span className="text-xs text-blue-400/80">
            Unsaved changes
          </span>
        </div>
      )}

      {/* Asset info */}
      {layer.assetId && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold tracking-widest uppercase text-white/40">Asset</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
            <span className="material-icons-round text-white/40 text-sm">image</span>
            <span className="text-xs text-white/60 truncate">{layer.assetId}</span>
          </div>
        </div>
      )}

      {/* Delete button */}
      {canRemove && onRemove && (
        <button
          onClick={() => onRemove(layer.id)}
          className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-icons-round text-sm">delete</span>
          Remove Layer
        </button>
      )}
    </div>
  );
};

export default LayerInspector;
