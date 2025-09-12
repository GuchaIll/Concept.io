import { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketService} from '../services/WebSocketService';
import { generateUserId } from './util';

export const blendModes = {
  NORMAL: 'normal',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HSL_HUE: 'hsl-hue',
  HSL_SATURATION: 'hsl-saturation',
  HSL_LUMINOSITY: 'hsl-luminosity',
} as const;

export type BlendMode = typeof blendModes[keyof typeof blendModes];

//background and foreground layers are ai generated and non-editable
export const LayerTypes = [
  { value: 'paint', label: 'Paint' },
  { value: 'background', label: 'Background' },
  { value: 'foreground', label: 'Foreground' },
]

export type LayerType = typeof LayerTypes[number]['value'];

export interface Layer {
  id: string;
  name: string;
  type?: LayerType;
  objects: string[];
  visible: boolean;
  opacity: number;
  zIndex: number;
  group?: string;
  locked?: boolean;
  blendMode?: BlendMode;
}

export const useLayers = (canvas: fabric.Canvas | null) => {
  const [layers, setLayers] = useState<Layer[]>([{
    id: 'base',
    name: 'Base Layer',
    type: 'paint',
    objects: [],
    visible: true,
    opacity: 1,
    zIndex: 0,
    locked: false
  }]);
  const [activeLayer, setActiveLayer] = useState<Layer>(layers[0]);
  const [wsService, setWsService] = useState<any>(null);

  useEffect(() => {
    if (canvas && !wsService)
    {
      const userId = generateUserId();
      const roomId = window.location.pathname.split('/').pop() || 'default-room';
      const wsURL = process.env.NODE_ENV === 'production' ? `wss://${window.location.host}` : 'ws://localhost:5000';
      const ws = new WebSocketService(wsURL,userId, roomId);
      ws.setCanvas(canvas);
      setWsService(ws);

    }
  }, [canvas, wsService]);

  const getLayerIndexByID = (layerID: string) => {
    return layers.findIndex(layer => layer.id === layerID);
  };

  const createLayerGroup = (objects : fabric.Object[], opacity : number) => {
        if(!canvas) return;
        const group = new fabric.Group(objects, {
          opacity: opacity,
          evented: true,
          selectable: true
        });
        return group
      }

  const addLayer = () => {
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
    setLayers([...layers, newLayer]);
    setActiveLayer(newLayer);
  };
  

  const removeLayer = (layerId: string) => {
    if (layers.length <= 1) return;
    setLayers(layers.filter(l => l.id !== layerId));
    if (activeLayer.id === layerId) {
      setActiveLayer(layers[0]);
    }
  };

  
  const updateLayerVisibility = (layerId: string, visible: boolean) => {
    if (!canvas) return;
    setLayers(layers.map(layer => 
      layer.id === layerId 
        ? { ...layer, visible } 
        : layer
    ));
  };

  const updateLayerBlendMode = (layerId: string, blendMode: string) => {
    if (!canvas) return;
    setLayers(layers.map(layer => 
      layer.id === layerId 
        ? { ...layer, blendMode: blendMode as BlendMode } 
        : layer
    ));
  }

  //Setting layer type to non paint modes makes it non-editable
  const updateLayerType = (layerId: string, type: string) => {
    if (!canvas) return;
    setLayers(layers.map(layer =>
      layer.id === layerId
        ? { ...layer, type: type as LayerType }
        : layer
    ));

    if(type !== 'paint')
    {
      const objects = canvas.getObjects().filter(obj => obj.layerId === layerId);
      if(!objects) return;

      objects.forEach(obj => {
        obj.selectable = false;
        obj.evented = false;
        obj.lockMovementX = true;
        obj.lockMovementY = true;
        obj.lockScalingX = true;
        obj.lockScalingY = true;
        obj.lockRotation = true;
      });

      canvas.renderAll();
    }
  }

  const updateLayerOpacity = (layerId: string, opacity: number) => {
    if (!canvas) return;
    setLayers(layers.map(layer => 
      layer.id === layerId 
        ? { ...layer, opacity } 
        : layer
    ));
    
    const objects = canvas.getObjects().filter(obj => obj.layerId === layerId);
    if(!objects) return;

    objects.forEach(obj => {
       if (obj.baseOpacity === undefined) {
          obj.baseOpacity = obj.opacity; // keep the original once
      }
      obj.opacity = obj.baseOpacity * opacity;
    });

    canvas.renderAll();
  };

    const addObjectToLayer = (object : fabric.FabricObject , layerID : string) => {
            if (!canvas ) return;
            const layer = layers[getLayerIndexByID(layerID)];
            if (!layer) return;
      
            layer.objects.push(object.id as string);
            canvas.add(object);
        }

    const removeObjectFromLayer = (object : fabric.Object, layerID: string) => {
        if (!canvas ) return;
        const layer = layers[getLayerIndexByID(layerID)];
        if (!layer) return;
      
        layer.objects = layer.objects.filter(obj => obj !== object.id);
        canvas.remove(object);
        }
    
    const groupSelectedObjects = () => {
      const active = canvas?.getActiveObjects();
      if(active && active.length > 1)
      {
        const group = new fabric.Group(active);
        canvas?.discardActiveObject();
        active.forEach(obj => canvas?.remove(obj));
        canvas?.add(group);
        canvas?.setActiveObject(group);
        canvas?.requestRenderAll();
      }
    }

    const ungroupSelectedObjects = () => {
      const active = canvas?.getActiveObject();
      if(active && active.type === 'group')
      {
        const group = active as fabric.Group;
        canvas?.remove(group);
        group._objects.forEach(obj => canvas?.add(obj));
        canvas?.setActiveObject(group._objects[0]);
        canvas?.requestRenderAll();
      }
    }

    const bringForward = () => {
      const active = canvas?.getActiveObject();
      if(active)
      {
        canvas?.bringObjectForward(active);
        canvas?.requestRenderAll();
      }
    }

    const bringObjectBackward = () => {
      const active = canvas?.getActiveObject();
      if(active)
      {
        canvas?.sendObjectBackwards(active);
        canvas?.requestRenderAll();
      }
    }

    const moveLayerUp = (layerId : string) =>
    {
      setLayers(prev =>
      {
        const index = prev.findIndex(l => l.id === layerId);
        if(index === -1 || index  === prev.length -1) return prev;
        const newLayers = [...prev];
        const [layer] = newLayers.splice(index, 1);
        newLayers.splice(index + 1, 0, layer);
        
        // Update z-index values for affected layers
        newLayers.forEach((l, i) => {
          l.zIndex = newLayers.length - 1 - i;
        });
        
        return newLayers;
      });
    }

    const moveLayerDown = (layerId : string) =>
    {
      setLayers(prev => 
      {
        const index = prev.findIndex(l => l.id === layerId);
        if(index <= 0) return prev;
        const newLayers = [...prev];
        const [layer] = newLayers.splice(index, 1);
        newLayers.splice(index - 1, 0, layer);
        
        // Update z-index values for affected layers
        newLayers.forEach((l, i) => {
          l.zIndex = newLayers.length - 1 - i;
        });
        
        return newLayers;
      });
    }

    const toggleLayerLock = (layerId : string) =>
    {
      setLayers(
        prev => prev.map(layer =>
          layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
        )
      )
    }
  

  const updateLayers = (e : any) => {
    console.log('Object added to canvas:', e);
    const object = e.target;
    if (!object) {
      console.log('No object found in event');
      return;
    }
    
    // Generate a unique ID for the object and assign layer ID
    const objectId = uuidv4();
    object.id = objectId;
    object.layerId = activeLayer.id;
    object.erasable = true; // Make object erasable by default

    // Add the object ID to the active layer's objects array
    setLayers(prevLayers => 
      prevLayers.map(layer => 
        layer.id === activeLayer.id 
          ? { ...layer, objects: [...layer.objects, objectId] }
          : layer
      )
    );

    wsService?.sendCanvasEvent('layer:updated', {
      layers,
      activeLayer
    })
    
    console.log('Updated object with ID:', objectId, 'in layer:', activeLayer.id);
  }


  return {
    
    layers,
    activeLayer,
    setActiveLayer,
    addLayer,
    removeLayer,
    updateLayerType,
    updateLayerVisibility,
    updateLayerOpacity,
    addObjectToLayer,
    removeObjectFromLayer,
    createLayerGroup,
    groupSelectedObjects,
    ungroupSelectedObjects,
    bringForward,
    bringObjectBackward,
    moveLayerUp,
    moveLayerDown,
    toggleLayerLock,
    updateLayers,
    updateLayerBlendMode
  };
};