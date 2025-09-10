
import type { Layer } from '../../../hooks/Layer';
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface LayerPanelProps {
  layers: Layer[];
  activeLayer: Layer;
  setActiveLayer: (layer: Layer) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  updateLayerVisibility: (id: string, visible: boolean) => void;
  updateLayerOpacity: (id: string, opacity: number) => void;
  moveLayerUp: (layerId: string) => void;
  moveLayerDown: (layerId: string) => void;
}

// Sortable Layer Item Component
interface SortableLayerItemProps {
  layer: Layer;
  activeLayer: Layer;
  setActiveLayer: (layer: Layer) => void;
  updateLayerVisibility: (id: string, visible: boolean) => void;
  updateLayerOpacity: (id: string, opacity: number) => void;
  removeLayer: (id: string) => void;
  layers: Layer[];
}

const SortableLayerItem: React.FC<SortableLayerItemProps> = ({
  layer,
  activeLayer,
  setActiveLayer,
  updateLayerVisibility,
  updateLayerOpacity,
  removeLayer,
  layers,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`flex items-center gap-2 p-2 rounded cursor-move ${
        activeLayer.id === layer.id ? 'bg-blue-700' : 'bg-gray-700'
      }`}
    >
      <div className="flex items-center gap-2 flex-1" {...listeners}>
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(e) => {
            e.stopPropagation();
            updateLayerVisibility(layer.id, e.target.checked);
          }}
          className="w-4 h-4"
          onClick={(e) => e.stopPropagation()}
        />
        <span 
          className="text-white"
          onClick={(e) => {
            e.stopPropagation();
            setActiveLayer(layer);
          }}
        >
          {layer.name}
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        value={layer.opacity * 100}
        onChange={(e) => {
          e.stopPropagation();
          updateLayerOpacity(layer.id, Number(e.target.value) / 100);
        }}
        className="w-20"
        onClick={(e) => e.stopPropagation()}
      />

      {layers.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeLayer(layer.id);
          }}
          className="text-red-500 hover:text-red-400"
        >
          ×
        </button>
      )}
    </div>
  );
};

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  activeLayer,
  setActiveLayer,
  addLayer,
  removeLayer,
  updateLayerVisibility,
  updateLayerOpacity,
  moveLayerUp,
  moveLayerDown,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = layers.findIndex(layer => layer.id === active.id);
    const newIndex = layers.findIndex(layer => layer.id === over.id);

    // Using arrayMove to get the new array order
    const newOrder = arrayMove(layers, oldIndex, newIndex);
    
    // Apply the moves in sequence to match the new order
    if (oldIndex < newIndex) {
      // Moving down
      for (let i = oldIndex; i < newIndex; i++) {
        moveLayerDown(newOrder[i].id);
      }
    } else {
      // Moving up
      for (let i = oldIndex; i > newIndex; i--) {
        moveLayerUp(newOrder[i].id);
      }
    }
  };

  return (
    <div className="fixed right-0 top-32 bottom-32 bg-gray-800 p-4 rounded-l-lg shadow-lg overflow-y-auto z-50">
      <div className="flex flex-col gap-2">
        <button
          onClick={addLayer}
          className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded flex items-center justify-center sticky top-0 z-10"
        >
          <span className="text-xl">+</span>
        </button>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layers.map(layer => layer.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2 min-w-[200px]">
              {layers.map((layer) => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  activeLayer={activeLayer}
                  setActiveLayer={setActiveLayer}
                  updateLayerVisibility={updateLayerVisibility}
                  updateLayerOpacity={updateLayerOpacity}
                  removeLayer={removeLayer}
                  layers={layers}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};