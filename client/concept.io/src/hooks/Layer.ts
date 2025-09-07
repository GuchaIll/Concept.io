import { useState } from 'react';
import * as fabric from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { Layer, BlendMode } from './types/Layer';

interface ObjectWithLayerId extends fabric.Object {
  layerId?: string;
  baseOpacity?: number;
}

export function useLayers(canvas: fabric.Canvas | null) {
  const [layers, setLayers] = useState<Layer[]>([{
    id: 'base',
    name: 'Base Layer',
    objects: [],
    visible: true,
    opacity: 1,
    zIndex: 0,
    locked: false
  }]);
  const [activeLayer, setActiveLayer] = useState<Layer>(layers[0]);

  const getLayerIndexByID = (layerID: string): number => 
    layers.findIndex(layer => layer.id === layerID);

  const createLayerGroup = (objects: fabric.Object[], opacity: number): fabric.Group | undefined => {
    if (!canvas) return;
    return new fabric.Group(objects, {
      opacity,
      evented: true,
      selectable: true
    });
  };

  // Layer management operations
  const layerOperations = {
    addLayer: (): void => {
      const newLayer: Layer = {
        id: `layer-${layers.length + 1}`,
        name: `Layer ${layers.length + 1}`,
        objects: [],
        visible: true,
        opacity: 1,
        zIndex: layers.length,
        locked: false,
        blendMode: 'normal'
      };
      setLayers(prev => [...prev, newLayer]);
      setActiveLayer(newLayer);
    },

    removeLayer: (layerId: string): void => {
      if (layers.length <= 1) return;
      setLayers(prev => prev.filter(l => l.id !== layerId));
      if (activeLayer.id === layerId) {
        setActiveLayer(layers[0]);
      }
    },

    updateLayerVisibility: (layerId: string, visible: boolean): void => {
      if (!canvas) return;
      setLayers(prev => prev.map(layer => 
        layer.id === layerId ? { ...layer, visible } : layer
      ));
    },

    updateLayerOpacity: (layerId: string, opacity: number): void => {
      if (!canvas) return;
      setLayers(prev => prev.map(layer => 
        layer.id === layerId ? { ...layer, opacity } : layer
      ));

      const objects = canvas.getObjects().filter(
        obj => (obj as ObjectWithLayerId).layerId === layerId
      ) as ObjectWithLayerId[];

      objects.forEach(obj => {
        if (obj.baseOpacity === undefined) {
          obj.baseOpacity = obj.opacity || 1;
        }
        obj.opacity = obj.baseOpacity * opacity;
      });

      canvas.renderAll();
    },

    toggleLayerLock: (layerId: string): void => {
      setLayers(prev => prev.map(layer =>
        layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
      ));
    }
  };

  // Object operations
  const objectOperations = {
    addObjectToLayer: (object: fabric.Object, layerID: string): void => {
      if (!canvas) return;
      const layer = layers[getLayerIndexByID(layerID)];
      if (!layer) return;

      (object as ObjectWithLayerId).layerId = layerID;
      const objectId = (object as any).id || uuidv4();
      (object as any).id = objectId;

      layer.objects.push(objectId);
      canvas.add(object);
    },

    removeObjectFromLayer: (object: fabric.Object, layerID: string): void => {
      if (!canvas) return;
      const layer = layers[getLayerIndexByID(layerID)];
      if (!layer) return;

      layer.objects = layer.objects.filter(obj => obj !== (object as any).id);
      canvas.remove(object);
    }
  };

  // Group operations
  const groupOperations = {
    groupSelectedObjects: (): void => {
      const active = canvas?.getActiveObjects();
      if (active && active.length > 1) {
        const group = new fabric.Group(active);
        canvas?.discardActiveObject();
        active.forEach(obj => canvas?.remove(obj));
        canvas?.add(group);
        canvas?.setActiveObject(group);
        canvas?.requestRenderAll();
      }
    },

    ungroupSelectedObjects: (): void => {
      const active = canvas?.getActiveObject();
      if (active?.type === 'group') {
        const group = active as fabric.Group;
        canvas?.remove(group);
        group._objects.forEach(obj => canvas?.add(obj));
        if (group._objects.length > 0) {
          canvas?.setActiveObject(group._objects[0]);
        }
        canvas?.requestRenderAll();
      }
    }
  };

  // Z-index operations
  const zIndexOperations = {
    bringForward: (): void => {
      const active = canvas?.getActiveObject();
      if (active) {
        canvas?.bringObjectForward(active);
        canvas?.requestRenderAll();
      }
    },

    bringObjectBackward: (): void => {
      const active = canvas?.getActiveObject();
      if (active) {
        canvas?.sendObjectBackwards(active);
        canvas?.requestRenderAll();
      }
    },

    moveLayerUp: (layerId: string): void => {
      setLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId);
        if (index === -1 || index === prev.length - 1) return prev;

        const newLayers = [...prev];
        const [layer] = newLayers.splice(index, 1);
        newLayers.splice(index + 1, 0, layer);

        return newLayers.map((l, i) => ({ ...l, zIndex: newLayers.length - 1 - i }));
      });
    },

    moveLayerDown: (layerId: string): void => {
      setLayers(prev => {
        const index = prev.findIndex(l => l.id === layerId);
        if (index <= 0) return prev;

        const newLayers = [...prev];
        const [layer] = newLayers.splice(index, 1);
        newLayers.splice(index - 1, 0, layer);

        return newLayers.map((l, i) => ({ ...l, zIndex: newLayers.length - 1 - i }));
      });
    }
  };

  const updateLayers = (e: fabric.IEvent): void => {
    const object = e.target;
    if (!object) return;

    const objectId = uuidv4();
    (object as any).id = objectId;
    (object as ObjectWithLayerId).layerId = activeLayer.id;

    setLayers(prevLayers => prevLayers.map(layer => 
      layer.id === activeLayer.id 
        ? { ...layer, objects: [...layer.objects, objectId] }
        : layer
    ));
  };

  return {
    layers,
    activeLayer,
    setActiveLayer,
    createLayerGroup,
    updateLayers,
    ...layerOperations,
    ...objectOperations,
    ...groupOperations,
    ...zIndexOperations
  };
}