import { useState, useEffect, useCallback, useRef } from 'react';
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

export const blendModeMap: Record<BlendMode, GlobalCompositeOperation> = {
        normal: 'source-over',
        multiply: 'multiply',
        screen: 'screen',
        overlay: 'overlay',
        darken: 'darken',
        lighten: 'lighten',
        'color-dodge': 'lighter', // approximate
        'color-burn': 'darken',   // approximate
        'hard-light': 'hard-light',
        'soft-light': 'soft-light',
        difference: 'difference',
        exclusion: 'exclusion',
        'hsl-hue': 'hue',
        'hsl-saturation': 'saturation',
        'hsl-luminosity': 'luminosity',
      };

//Layer types for different workflows
export const LayerTypes = [
  { value: 'paint', label: 'Paint' },
  { value: 'asset', label: 'Asset' },
  { value: 'backgroundPlate', label: 'Background Plate' },
  { value: 'diffusionRegion', label: 'Diffusion Region' },
  { value: 'lightingOverlay', label: 'Lighting Overlay' },
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
  CachedBitmap?: fabric.FabricImage;
  isDirty?: boolean;
  assetId?: string;
  thumbnail?: string;
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
    locked: false,
    blendMode: 'normal'
  }]);
  const [activeLayer, setActiveLayer] = useState<Layer>(layers[0]);
  const [wsService, setWsService] = useState<any>(null);
  const [switchingLayer, setSwitchingLayer] = useState<boolean>(false);
  const thumbnailTimersRef = useRef<Record<string, number>>({});
  
  // Use a ref to always have the current active layer for event handlers
  const activeLayerRef = useRef<Layer>(activeLayer);
  
  // Use a ref to always have the current layers for event handlers
  const layersRef = useRef<Layer[]>(layers);
  
  // Flag to prevent updateLayers from running during reorder operations
  const reorderingRef = useRef<boolean>(false);
  
  // Keep the refs in sync with state
  useEffect(() => {
    activeLayerRef.current = activeLayer;
    console.log('Active layer ref updated to:', activeLayer.id, activeLayer.name);
  }, [activeLayer]);
  
  useEffect(() => {
    layersRef.current = layers;
    console.log('Layers ref updated:', layers.map(l => `${l.name}(z:${l.zIndex})`));
  }, [layers]);


  useEffect(() => {
    if (canvas && !wsService)
    {
      const userId = generateUserId();
      // Use projectId from session context (passed via CanvasProvider)
      const roomId = 'project-demo-1'; // TODO: Wire from SessionContext via props
      const wsURL = 'http://localhost:5000';
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

  /**
   * Create a new asset layer from image data and add the image to the canvas.
   * If width/height are provided they are used as the desired canvas footprint
   * (the image is scaled to fit). Alpha transparency is preserved.
   * Returns the created Layer, or null if something went wrong.
   */
  const addAssetLayer = useCallback(async (
    assetId: string,
    name: string,
    imageData: string,
    width: number,
    height: number,
    left?: number,
    top?: number,
  ): Promise<Layer | null> => {
    if (!canvas) {
      console.warn('[addAssetLayer] No canvas');
      return null;
    }

    const layerId = `asset-${assetId}-${uuidv4().slice(0, 6)}`;
    const newLayer: Layer = {
      id: layerId,
      name,
      type: 'asset',
      objects: [],
      visible: true,
      opacity: 1,
      zIndex: layersRef.current.length,
      locked: false,
      blendMode: 'normal',
    };

    setLayers(prev => [...prev, newLayer]);
    // Do NOT change the active layer — the user's current paint layer should
    // remain active so that brush strokes after placing an asset still land
    // on the correct paint layer.  The asset image is tagged with its own
    // layerId below so it belongs to the right layer in the panel.

    try {
      // Load image — crossOrigin 'anonymous' is fine for data-URLs and
      // ensures Fabric doesn't taint the canvas when the src is a blob/http URL.
      const fabricImg = await fabric.FabricImage.fromURL(imageData, { crossOrigin: 'anonymous' });

      // Scale the image so its visual footprint matches the requested width/height.
      // This lets generation results fit the selection bounds the user drew.
      const naturalW = fabricImg.width ?? 1;
      const naturalH = fabricImg.height ?? 1;
      const scaleX = width  > 0 ? width  / naturalW : 1;
      const scaleY = height > 0 ? height / naturalH : 1;

      fabricImg.set({
        left: left ?? 100,
        top: top ?? 100,
        scaleX,
        scaleY,
        // Full interactivity
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        lockRotation: false,
        lockScalingX: false,
        lockScalingY: false,
        lockMovementX: false,
        lockMovementY: false,
        // Uniform scaling off so user can freely stretch
        lockUniScaling: false,
      });

      // Tag the object so it belongs to this layer
      (fabricImg as any).layerId = layerId;

      canvas.add(fabricImg);
      canvas.setActiveObject(fabricImg);
      canvas.requestRenderAll();

      console.log(
        '[addAssetLayer] Added', name, 'to canvas at', left, top,
        '— natural', naturalW, 'x', naturalH,
        '— scaled', (naturalW * scaleX).toFixed(0), 'x', (naturalH * scaleY).toFixed(0),
      );
      return newLayer;
    } catch (err) {
      console.error('[addAssetLayer] Failed to load image:', err);
      return null;
    }
  }, [canvas]);
  

  const removeLayer = (layerId: string) => {
    if (layers.length <= 1) return;
    setLayers(layers.filter(l => l.id !== layerId));
    if (activeLayer.id === layerId) {
      setActiveLayer(layers[0]);
    }
  };

  
  const updateLayerVisibility = (layerId: string, visible: boolean) => {
    if (!canvas) return;
    
    console.log(`Toggling visibility for layer ${layerId} to ${visible}`);
    
    // Update layer state
    setLayers(layers.map(layer => 
      layer.id === layerId 
        ? { ...layer, visible } 
        : layer
    ));
    
    // Update objects on canvas
    const allObjects = canvas.getObjects();
    const layerObjects = allObjects.filter(obj => obj.layerId === layerId);
    
    console.log(`Found ${layerObjects.length} objects for layer ${layerId} out of ${allObjects.length} total`);
    console.log('All objects by layer:', allObjects.map(obj => ({ id: obj.id?.substring(0, 8), layerId: obj.layerId })));
    
    layerObjects.forEach(obj => {
      obj.visible = visible;
    });
    canvas.requestRenderAll();
    scheduleLayerThumbnail(layerId);
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
    scheduleLayerThumbnail(layerId);
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
      if (!canvas) return;
      
      setLayers(prev =>
      {
        const index = prev.findIndex(l => l.id === layerId);
        if(index === -1 || index  === prev.length -1) return prev;
        const newLayers = [...prev];
        const [layer] = newLayers.splice(index, 1);
        newLayers.splice(index + 1, 0, layer);
        
        // Update z-index values for affected layers
        newLayers.forEach((l, i) => {
          l.zIndex = i;
        });
        
        // Reorder objects in canvas
        setTimeout(() => reorderCanvasObjects(newLayers), 0);
        
        return newLayers;
      });
    }

    const moveLayerDown = (layerId : string) =>
    {
      if (!canvas) return;
      
      setLayers(prev => 
      {
        const index = prev.findIndex(l => l.id === layerId);
        if(index <= 0) return prev;
        const newLayers = [...prev];
        const [layer] = newLayers.splice(index, 1);
        newLayers.splice(index - 1, 0, layer);
        
        // Update z-index values for affected layers
        newLayers.forEach((l, i) => {
          l.zIndex = i;
        });
        
        // Reorder objects in canvas
        setTimeout(() => reorderCanvasObjects(newLayers), 0);
        
        return newLayers;
      });
    }
    
    // Helper function to reorder canvas objects based on layer order
    // In the UI, layers at the top of the list should appear on top visually
    // In Fabric.js, objects added later appear on top
    // So we need to add objects in REVERSE layer order (bottom layers first)
    const reorderCanvasObjects = (orderedLayers: Layer[]) => {
      if (!canvas) return;
      
      const allObjects = canvas.getObjects();
      if (allObjects.length === 0) return;
      
      // Set flag to prevent updateLayers from running during reorder
      reorderingRef.current = true;
      
      // Create a map of objects by layer
      const objectsByLayer = new Map<string, fabric.FabricObject[]>();
      allObjects.forEach(obj => {
        const layerId = obj.layerId || 'base';
        if (!objectsByLayer.has(layerId)) {
          objectsByLayer.set(layerId, []);
        }
        objectsByLayer.get(layerId)!.push(obj);
      });
      
      // Remove all objects
      canvas.remove(...allObjects);
      
      // Re-add objects in REVERSE layer order 
      // (last layer in array = bottom of UI = added first = appears at bottom)
      const reversedLayers = [...orderedLayers].reverse();
      reversedLayers.forEach(layer => {
        const layerObjs = objectsByLayer.get(layer.id) || [];
        layerObjs.forEach(obj => canvas.add(obj));
      });
      
      canvas.requestRenderAll();
      console.log('Reordered canvas objects based on layer order');
      
      // Clear the reordering flag after a short delay
      setTimeout(() => {
        reorderingRef.current = false;
      }, 50);
    };

  const toggleLayerLock = (layerId : string) =>
  {
      setLayers(prev =>
        prev.map(layer =>
          layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
        )
      );
      setActiveLayer(prev =>
        prev.id === layerId ? { ...prev, locked: !prev.locked } : prev
      );
    }

  // Update the z-index of all objects based on layer order - call this manually when needed
  const updateObjectZIndices = useCallback(() => {
    if (!canvas) return;
    
    const allObjects = canvas.getObjects();
    if (allObjects.length === 0) return;
    
    // Sort objects by their layer's zIndex
    layers.forEach((layer, _layerIndex) => {
      const layerObjects = allObjects.filter(obj => obj.layerId === layer.id);
      layerObjects.forEach(obj => {
        // Set visibility based on layer visibility
        obj.visible = layer.visible;
        // Set opacity based on layer opacity  
        if (obj.baseOpacity !== undefined) {
          obj.opacity = obj.baseOpacity * layer.opacity;
        }
      });
    });
    
    canvas.requestRenderAll();
  }, [canvas, layers]);

  const buildLayerThumbnail = useCallback(async (layerId: string) => {
    if (!canvas) return;

    const layerObjects = canvas.getObjects().filter(obj => obj.layerId === layerId);
    if (layerObjects.length === 0) {
      setLayers(prev => prev.map(layer =>
        layer.id === layerId ? { ...layer, thumbnail: undefined } : layer
      ));
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    layerObjects.forEach(obj => {
      const bounds = obj.getBoundingRect(true, true);
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.left + bounds.width);
      maxY = Math.max(maxY, bounds.top + bounds.height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return;
    }

    const padding = 2;
    const width = Math.max(1, Math.ceil(maxX - minX + padding * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + padding * 2));

    const tempEl = document.createElement('canvas');
    tempEl.width = width;
    tempEl.height = height;
    const tempCanvas = new fabric.StaticCanvas(tempEl, { backgroundColor: 'transparent' });

    const clones = await Promise.all(layerObjects.map(obj =>
      obj.clone(['id', 'layerId', 'baseOpacity']) as Promise<fabric.FabricObject>
    ));

    clones.forEach(clone => {
      const left = clone.left ?? 0;
      const top = clone.top ?? 0;
      clone.set({
        left: left - minX + padding,
        top: top - minY + padding,
        selectable: false,
        evented: false,
        visible: true,
      });
      tempCanvas.add(clone);
    });

    tempCanvas.requestRenderAll();
    const dataUrl = tempCanvas.toDataURL({ format: 'png', multiplier: 1 });
    tempCanvas.dispose();

    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, thumbnail: dataUrl } : layer
    ));
  }, [canvas]);

  const scheduleLayerThumbnail = useCallback((layerId: string) => {
    if (!canvas) return;
    const existing = thumbnailTimersRef.current[layerId];
    if (existing) {
      window.clearTimeout(existing);
    }
    thumbnailTimersRef.current[layerId] = window.setTimeout(() => {
      delete thumbnailTimersRef.current[layerId];
      buildLayerThumbnail(layerId);
    }, 120);
  }, [canvas, buildLayerThumbnail]);

  const refreshLayerThumbnail = useCallback((layerId: string) => {
    scheduleLayerThumbnail(layerId);
  }, [scheduleLayerThumbnail]);

  const refreshLayerThumbnailForObject = useCallback((object: fabric.FabricObject) => {
    const layerId = object.layerId ?? activeLayerRef.current.id;
    scheduleLayerThumbnail(layerId);
  }, [scheduleLayerThumbnail]);
    
  const switchLayer = (newLayer: Layer) => {
    // Don't switch if already on this layer or currently switching
    if (switchingLayer) {
      console.log('Already switching layers, ignoring');
      return;
    }
    
    if (activeLayer.id === newLayer.id) {
      console.log('Already on this layer:', newLayer.id);
      return;
    }

    console.log('Switching from layer', activeLayer.id, 'to', newLayer.id);
    
    setSwitchingLayer(true);

    try {
      // Just update the active layer - all layers remain visible based on their visibility setting
      setActiveLayer(newLayer);
      
      if (canvas) {
        canvas.requestRenderAll();
      }
      
      console.log('Layer switched to:', newLayer.name);
    } catch (error) {
      console.error('Error switching layers:', error);
    } finally {
      setSwitchingLayer(false);
    }
  };

  const updateLayers = (e : any) => {
    console.log('Object added to canvas:', e);
    const object = e.target;
    if (!object) {
      console.log('No object found in event');
      return;
    }
    
    // Skip entirely if we're in the middle of reordering layers
    if (reorderingRef.current) {
      console.log('Currently reordering layers - skipping updateLayers');
      return;
    }
    
    // Skip if object is being repositioned (to avoid infinite loop)
    if (object._repositioning) {
      console.log('Object is being repositioned - skipping');
      return;
    }
    
    // If object already has a layerId, don't reassign it
    // This happens when objects are re-added during reorder or restore
    if (object.layerId) {
      console.log('Object already has layerId:', object.layerId, '- skipping reassignment');
      return;
    }
    
    // Use the ref to get the current active layer (not stale closure value)
    const currentActiveLayer = activeLayerRef.current;
    
    // Generate a unique ID for the object and assign layer ID
    const objectId = uuidv4();
    object.id = objectId;
    object.layerId = currentActiveLayer.id;
    object.erasable = true; // Make object erasable by default

    console.log('Assigning NEW object to layer:', currentActiveLayer.id, currentActiveLayer.name);

    // Position the new object correctly based on layer z-order
    // Objects on layers with higher zIndex (top of UI) should appear on top
    if (canvas) {
      const allObjects = canvas.getObjects();
      const currentLayers = layersRef.current; // Use ref for current layer state
      
      // Look up the CURRENT zIndex from layersRef (not the potentially stale one in activeLayerRef)
      const currentLayerFromRef = currentLayers.find(l => l.id === currentActiveLayer.id);
      const currentLayerZIndex = currentLayerFromRef?.zIndex ?? currentActiveLayer.zIndex;
      
      console.log('Positioning object. Active layer:', currentActiveLayer.id, 'zIndex:', currentLayerZIndex);
      console.log('Current layers:', currentLayers.map(l => `${l.name}(z:${l.zIndex})`));
      
      // Find the correct insertion index
      // We need to insert AFTER all objects from layers with lower zIndex
      // and BEFORE objects from layers with higher zIndex
      let insertIndex = allObjects.length; // Default: add at end
      
      for (let i = 0; i < allObjects.length; i++) {
        const obj = allObjects[i];
        const objLayerId = obj.layerId || 'base';
        
        // Find the layer for this object using ref
        const objLayer = currentLayers.find(l => l.id === objLayerId);
        const objZIndex = objLayer?.zIndex ?? 0;
        
        // If we find an object from a layer with higher zIndex, insert before it
        if (objZIndex > currentLayerZIndex) {
          insertIndex = i;
          break;
        }
      }
      
      // If the object is not at the correct position, move it
      const currentIndex = allObjects.indexOf(object);
      if (currentIndex !== insertIndex && currentIndex !== insertIndex - 1) {
        // Remove and re-insert at correct position
        canvas.remove(object);
        
        // Temporarily set a flag to prevent re-triggering updateLayers
        object._repositioning = true;
        
        // Insert at the correct position
        const updatedObjects = canvas.getObjects();
        if (insertIndex >= updatedObjects.length) {
          canvas.add(object);
        } else {
          canvas.insertAt(insertIndex, object);
        }
        
        delete object._repositioning;
        canvas.requestRenderAll();
        
        console.log(`Repositioned object from index ${currentIndex} to ${insertIndex}`);
      }
    }

    const mainCtx = canvas?.getContext();
    if(mainCtx)
    {
      mainCtx.save();
      mainCtx.globalCompositeOperation = 'multiply';
      mainCtx.restore();
    }

    // Add the object ID to the active layer's objects array
    setLayers(prevLayers => 
      prevLayers.map(layer => 
        layer.id === currentActiveLayer.id 
          ? { ...layer, objects: [...layer.objects, objectId] }
          : layer
      )
    );

    wsService?.sendCanvasEvent('layer:updated', {
      layers,
      activeLayer: currentActiveLayer
    })
    
    console.log('Updated object with ID:', objectId, 'in layer:', currentActiveLayer.id);
  }

  const reorderLayers = (oldIndex: number, newIndex: number) => {
    if (!canvas) return;
    
    console.log(`=== REORDER START ===`);
    console.log(`Reordering layers: moving index ${oldIndex} to ${newIndex}`);
    
    // Set flag to prevent updateLayers from running during reorder
    reorderingRef.current = true;
    
    // Capture current canvas objects BEFORE any state update
    const allObjects = canvas.getObjects();
    console.log('Canvas objects count:', allObjects.length);
    
    // Log each object's details
    allObjects.forEach((obj, i) => {
      console.log(`  Object ${i}: type=${obj.type}, layerId=${obj.layerId}, visible=${obj.visible}`);
    });
    
    // Make a copy of the array to ensure we have stable references
    const objectsCopy = [...allObjects];
    
    // Create a map of objects by layer
    const objectsByLayer = new Map<string, fabric.FabricObject[]>();
    
    objectsCopy.forEach(obj => {
      const layerId = obj.layerId || 'base';
      if (!objectsByLayer.has(layerId)) {
        objectsByLayer.set(layerId, []);
      }
      objectsByLayer.get(layerId)!.push(obj);
    });
    
    // Log what we captured
    console.log('Objects by layer:');
    objectsByLayer.forEach((objs, layerId) => {
      console.log(`  Layer ${layerId}: ${objs.length} objects`);
    });
    
    // Get current layers and compute new order
    console.log('Current layers state:', layers.map(l => `${l.name}(${l.id})`));
    const currentLayers = [...layers];
    const [removed] = currentLayers.splice(oldIndex, 1);
    currentLayers.splice(newIndex, 0, removed);
    
    // Update zIndex for all layers (index 0 = top of list = highest zIndex)
    const updatedLayers = currentLayers.map((layer, i) => ({
      ...layer,
      zIndex: currentLayers.length - 1 - i
    }));
    
    console.log('New layer order:', updatedLayers.map(l => `${l.name}(z:${l.zIndex})`));
    
    // Update state
    setLayers(updatedLayers);
    
    // Handle canvas reordering if we have objects
    if (objectsCopy.length > 0) {
      // Use requestAnimationFrame for better timing with React's render cycle
      requestAnimationFrame(() => {
        if (!canvas) {
          console.log('Canvas became null in requestAnimationFrame');
          reorderingRef.current = false;
          return;
        }
        
        console.log('Inside requestAnimationFrame:');
        
        // Check objects in map are still valid
        let mapObjectCount = 0;
        objectsByLayer.forEach((objs, layerId) => {
          console.log(`  Map layer ${layerId}: ${objs.length} objects, first object type: ${objs[0]?.type}`);
          mapObjectCount += objs.length;
        });
        console.log(`  Total in map: ${mapObjectCount}`);
        
        // Remove all objects from canvas
        const currentCanvasObjects = canvas.getObjects();
        console.log(`  Current canvas objects before remove: ${currentCanvasObjects.length}`);
        
        if (currentCanvasObjects.length > 0) {
          canvas.remove(...currentCanvasObjects);
          console.log(`  After remove, canvas objects: ${canvas.getObjects().length}`);
        }
        
        // Re-add objects in REVERSE layer order using our captured map
        // (last in array = bottom of UI = added first = appears at bottom)
        const reversedLayers = [...updatedLayers].reverse();
        console.log('Adding objects in order:', reversedLayers.map(l => l.name));
        
        let addedCount = 0;
        reversedLayers.forEach(layer => {
          const layerObjs = objectsByLayer.get(layer.id) || [];
          console.log(`  Adding ${layerObjs.length} objects for layer ${layer.name} (${layer.id})`);
          layerObjs.forEach((obj, i) => {
            // Ensure layerId is preserved
            if (!obj.layerId) {
              obj.layerId = layer.id;
            }
            console.log(`    Adding object ${i}: type=${obj.type}, layerId=${obj.layerId}`);
            canvas.add(obj);
            addedCount++;
          });
        });
        
        console.log(`Added ${addedCount} objects back to canvas`);
        console.log(`Canvas objects after add: ${canvas.getObjects().length}`);
        canvas.requestRenderAll();
        console.log('=== REORDER COMPLETE ===');
        
        // Clear the reordering flag after a short delay
        setTimeout(() => {
          reorderingRef.current = false;
          console.log('Reordering flag cleared');
        }, 100);
      });
    } else {
      console.log('No objects to reorder');
      reorderingRef.current = false;
    }
  };

  // Restore layers from a snapshot (updates both layer state and canvas objects)
  const restoreLayersFromSnapshot = useCallback((snapshotLayers: Array<{
    layerId: string;
    name: string;
    type?: string;
    objects: string;
    visible: boolean;
    opacity: number;
    blendMode?: string;
    zIndex: number;
  }>) => {
    if (!canvas) return;
    
    // Sort by zIndex DESCENDING - higher zIndex = top of list = first in array
    const sortedSnapshotLayers = [...snapshotLayers].sort((a, b) => b.zIndex - a.zIndex);
    
    // Create new layer state from snapshot
    const newLayers: Layer[] = sortedSnapshotLayers.map((sl, index) => ({
      id: sl.layerId,
      name: sl.name,
      type: (sl.type as LayerType) || 'paint',
      objects: [],
      visible: sl.visible,
      opacity: sl.opacity,
      // Recalculate zIndex based on position (first = highest)
      zIndex: sortedSnapshotLayers.length - 1 - index,
      locked: false,
      blendMode: (sl.blendMode as BlendMode) || 'normal',
    }));
    
    // Update layers state
    setLayers(newLayers);
    
    // Set first layer as active (top layer)
    if (newLayers.length > 0) {
      setActiveLayer(newLayers[0]);
    }
    
    console.log('Restored layers from snapshot:', newLayers.map(l => `${l.name}(z:${l.zIndex})`));
  }, [canvas]);


  return {
    layers,
    setLayers,
    activeLayer,
    setActiveLayer,
    addLayer,
    addAssetLayer,
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
    updateLayerBlendMode,
    switchLayer,
    reorderLayers,
    restoreLayersFromSnapshot,
    updateObjectZIndices,
    refreshLayerThumbnail,
    refreshLayerThumbnailForObject
  }
};
