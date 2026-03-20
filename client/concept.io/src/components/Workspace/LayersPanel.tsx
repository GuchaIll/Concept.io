import { useState } from 'react';
import type { Layer, LayerType } from '../../hooks/Layer';
import { LayerTypes, blendModes } from '../../hooks/Layer';
import { getLayerConstraints } from '../../config/layerConstraints';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface LayerVersion {
  id: string;
  label: string;
  thumbnail?: string;
  isActive: boolean;
}

interface LayerWithVersions extends Layer {
  versions?: LayerVersion[];
  versionCount?: number;
}

interface LayersPanelProps {
  layers: LayerWithVersions[];
  activeLayer: Layer;
  onLayerSelect: (layer: Layer) => void;
  onAddLayer: () => void;
  onToggleVisibility: (layerId: string, visible: boolean) => void;
  onLayerTypeChange?: (layerId: string, type: LayerType) => void;
  onReorderLayers?: (oldIndex: number, newIndex: number) => void;
  onViewHistory?: () => void;
  onSaveLayerAsAsset?: (layerId: string, layerName: string) => void;
  onOpacityChange?: (layerId: string, opacity: number) => void;
  onBlendModeChange?: (layerId: string, blendMode: string) => void;
  onLockToggle?: (layerId: string) => void;
  onRemoveLayer?: (layerId: string) => void;
}

export const LayersPanel = ({
  layers,
  activeLayer,
  onLayerSelect,
  onAddLayer,
  onToggleVisibility,
  onLayerTypeChange,
  onReorderLayers,
  onViewHistory,
  onSaveLayerAsAsset,
  onOpacityChange,
  onBlendModeChange,
  onLockToggle,
  onRemoveLayer,
}: LayersPanelProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layers.findIndex((l) => l.id === active.id);
      const newIndex = layers.findIndex((l) => l.id === over.id);
      onReorderLayers?.(oldIndex, newIndex);
    }
  };

  return (
    <aside className="absolute right-6 top-24 bottom-24 w-72 flex flex-col gap-4 z-20">
      <div className="glass-panel flex-1 rounded-3xl thin-border overflow-hidden flex flex-col">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-widest uppercase text-white/50">
            Layers & Branches
          </h2>
          <button onClick={onAddLayer} className="text-white/30 hover:text-white transition-colors">
            <span className="material-icons-round text-xl">add</span>
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-4">
              {layers.map((layer) => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  isActive={activeLayer.id === layer.id}
                  onSelect={() => onLayerSelect(layer)}
                  onToggleVisibility={(visible) => onToggleVisibility(layer.id, visible)}
                  onTypeChange={(type) => onLayerTypeChange?.(layer.id, type)}
                  onSaveAsAsset={() => onSaveLayerAsAsset?.(layer.id, layer.name)}
                  onOpacityChange={onOpacityChange}
                  onBlendModeChange={onBlendModeChange}
                  onLockToggle={onLockToggle}
                  onRemoveLayer={onRemoveLayer}
                  canRemove={layers.length > 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="p-4 bg-white/5 border-t border-white/5">
          <button
            onClick={onViewHistory}
            className="w-full py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-full text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2"
          >
            <span className="material-icons-round text-sm">history</span>
            View Full History
          </button>
        </div>
      </div>
    </aside>
  );
};

const SortableLayerItem = ({ layer, isActive, onSelect, onToggleVisibility, onTypeChange, onSaveAsAsset, onOpacityChange, onBlendModeChange, onLockToggle, onRemoveLayer, canRemove }: {
  layer: LayerWithVersions;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisibility: (visible: boolean) => void;
  onTypeChange: (type: LayerType) => void;
  onSaveAsAsset?: () => void;
  onOpacityChange?: (layerId: string, opacity: number) => void;
  onBlendModeChange?: (layerId: string, blendMode: string) => void;
  onLockToggle?: (layerId: string) => void;
  onRemoveLayer?: (layerId: string) => void;
  canRemove?: boolean;
}) => {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Layer selected:', layer.id, layer.name);
    onSelect();
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div 
        className={`flex items-center gap-3 p-2 pt-4 pb-4 rounded-lg transition-colors ${isActive ? 'bg-primary/10' : ''} ${!layer.visible ? 'opacity-60' : ''}`}
      >
        {/* Drag Handle - only this initiates drag */}
        <div 
          {...attributes} 
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/40 p-1 touch-none"
        >
          <span className="material-icons-round text-sm">drag_indicator</span>
        </div>

        {/* Thumbnail - clickable for selection */}
        <div 
          onClick={handleSelect}
          role="button"
          tabIndex={0}
          className={`w-10 h-10 rounded-lg bg-white/5 overflow-hidden thin-border cursor-pointer transition-all flex-shrink-0 ${isActive ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-white/20'}`}
        >
          <div className="w-full h-full checkerboard-sm">
            {layer.thumbnail ? (
              <img
                src={layer.thumbnail}
                alt={`${layer.name} thumbnail`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20">
                <span className="material-icons-round text-lg">layers</span>
              </div>
            )}
          </div>
        </div>

        {/* Info - clickable for selection */}
        <div className="flex-1 min-w-0">
          <div 
            onClick={handleSelect}
            role="button"
            tabIndex={0}
            className="cursor-pointer"
          >
            <p className={`text-[11px] font-semibold truncate hover:text-primary transition-colors ${isActive ? 'text-primary' : ''}`}>
              {layer.name}
            </p>
          </div>
          {/* Layer Type Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTypeDropdown(!showTypeDropdown);
              }}
              className="text-[9px] text-white/40 hover:text-white/60 flex items-center gap-1"
            >
              {LayerTypes.find(t => t.value === layer.type)?.label || 'Paint'}
              <span className="material-icons-round text-[10px]">expand_more</span>
            </button>
            {showTypeDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-background-dark border border-white/10 rounded-lg shadow-xl z-50 min-w-[140px]">
                {LayerTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTypeChange(type.value as LayerType);
                      setShowTypeDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-[10px] hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg ${
                      layer.type === type.value ? 'text-primary' : 'text-white/70'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Visibility Toggle */}
        <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(!layer.visible); }}>
          <span className={`material-icons-round text-[5px] leading-none ${layer.visible ? 'text-primary' : 'text-white/30'}` }  style={{ fontSize: 16 }}>
            {layer.visible ? 'visibility' : 'visibility_off'}
          </span>
        </button>

        {/* Lock Toggle */}
        <button onClick={(e) => { e.stopPropagation(); onLockToggle?.(layer.id); }}>
          <span className={`material-icons-round text-[5px] leading-none ${layer.locked ? 'text-primary' : 'text-white/30'}`}  style={{ fontSize: 16 }}>
            {layer.locked ? 'lock' : 'lock_open'}
          </span>
        </button>

        {/* More Menu */}
        <div className="relative">
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); }}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            <span className="material-icons-round text-[5px] leading-none"  style={{ fontSize: 16 }}>more_vert</span>
          </button>
          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-1 bg-background-dark border border-white/10 rounded-lg shadow-xl z-50 min-w-[140px]">
              {layer.type !== 'asset' && onSaveAsAsset && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveAsAsset();
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-[10px] hover:bg-white/10 rounded-t-lg text-white/70 flex items-center gap-2"
                >
                  <span className="material-icons-round text-xs">save</span>
                  Save as Asset
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-[10px] hover:bg-white/10 text-white/70 flex items-center gap-2"
              >
                <span className="material-icons-round text-xs">content_copy</span>
                Duplicate
              </button>
              {canRemove && onRemoveLayer && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLayer(layer.id);
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-[10px] hover:bg-white/10 rounded-b-lg text-red-400/80 flex items-center gap-2"
                >
                  <span className="material-icons-round text-xs">delete</span>
                  Delete Layer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline Property Editor — always shown for paint layers */}
      {getLayerConstraints(layer.type).allowDrawing && (
        <div className="pt-2 mt-1 border-t border-white/5 pl-6">
          <div className="flex gap-4 w-full">
            {/* Opacity */}
            <div className="space-y-1 flex-1 min-w-0">
              <label className="text-[9px] uppercase tracking-wider font-bold text-white/30">Opacity</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  title="Layer opacity"
                  value={Math.round(layer.opacity * 100)}
                  onChange={(e) => {
                    e.stopPropagation();
                    onOpacityChange?.(layer.id, Number(e.target.value) / 100);
                  }}
                  className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                />
                <span className="text-[10px] font-mono text-white/60 w-6 text-right">
                  {Math.round(layer.opacity * 100)}
                </span>
              </div>
            </div>

            {/* Blend Mode — only for paint-capable layers */}
            {(() => {
              const constraints = getLayerConstraints(layer.type);
              if (!constraints.allowDrawing) return null;

              const blendModeEntries = Object.entries(blendModes).map(([key, value]) => ({
                label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '),
                value,
              }));

              return (
                <div className="space-y-1 w-16 flex-shrink-0">
                  <label className="text-[9px] uppercase tracking-wider font-bold text-white/30">Blend Mode</label>
                  <select
                    title="Blend mode"
                    value={layer.blendMode || 'normal'}
                    onChange={(e) => {
                      e.stopPropagation();
                      onBlendModeChange?.(layer.id, e.target.value);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white outline-none focus:border-primary/50 appearance-none cursor-pointer"
                  >
                    {blendModeEntries.map((mode) => (
                      <option key={mode.value} value={mode.value} className="bg-gray-800">
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Version Branches */}
      {layer.versions && layer.versions.length > 0 && (
        <div className="pl-8 flex gap-2 overflow-x-auto no-scrollbar">
          {layer.versions.map((v) => (
            <div 
              key={v.id} 
              className={`min-w-[40px] h-[32px] rounded-md flex items-center justify-center cursor-pointer ${
                v.isActive ? 'border border-primary/50 bg-primary/20' : 'border border-white/10 bg-white/5 opacity-50 hover:opacity-75'
              }`}
            >
              <span className={`text-[8px] font-bold ${v.isActive ? '' : 'text-white/40'}`}>{v.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
