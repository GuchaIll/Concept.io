import { useState } from 'react';
import type { Layer, LayerType } from '../../hooks/Layer';
import { LayerTypes } from '../../hooks/Layer';
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
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
              {layers.map((layer) => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  isActive={activeLayer.id === layer.id}
                  onSelect={() => onLayerSelect(layer)}
                  onToggleVisibility={(visible) => onToggleVisibility(layer.id, visible)}
                  onTypeChange={(type) => onLayerTypeChange?.(layer.id, type)}
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

const SortableLayerItem = ({ layer, isActive, onSelect, onToggleVisibility, onTypeChange }: {
  layer: LayerWithVersions;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisibility: (visible: boolean) => void;
  onTypeChange: (type: LayerType) => void;
}) => {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  
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
    <div ref={setNodeRef} style={style} className="space-y-3">
      <div 
        className={`flex items-center gap-3 p-1 rounded-lg transition-colors ${isActive ? 'bg-primary/10' : ''} ${!layer.visible ? 'opacity-60' : ''}`}
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
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <span className="material-icons-round text-lg">layers</span>
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
          <span className={`material-icons-round text-sm ${layer.visible ? 'text-primary' : 'text-white/30'}`}>
            {layer.visible ? 'visibility' : 'visibility_off'}
          </span>
        </button>
      </div>

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
