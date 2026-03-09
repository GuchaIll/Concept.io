import { useState, useEffect, useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketService} from '../services/WebSocketService';
import { generateUserId } from './util';
import { getLayerConstraints } from '../config/layerConstraints';
import { useSession } from '../contexts/SessionContext';

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

// Blend mode map is available but not currently used - kept for future reference
// const blendModeMap: Record<BlendMode, GlobalCompositeOperation> = {
//   normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay',
//   darken: 'darken', lighten: 'lighten', 'color-dodge': 'lighter', 'color-burn': 'darken',
//   'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference',
//   exclusion: 'exclusion', 'hsl-hue': 'hue', 'hsl-saturation': 'saturation', 'hsl-luminosity': 'luminosity',
// };

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
  
  // Delta snapshot tracking
  isDirty?: boolean;           // True when layer has unsaved changes
  lastModifiedAt?: number;     // Timestamp of last modification
  lastSnapshotId?: string;     // ID of last snapshot that captured this layer fully
  
  // Asset layer specific properties
  assetId?: string;           // Reference to asset in vault
  assetImageData?: string;    // Cached image data for the asset
}

export const useLayers = (canvas: fabric.Canvas | null) => {
  const { projectId: sessionProjectId } = useSession();
  const [layers, setLayers] = useState<Layer[]>([{
    id: 'base',
    name: 'Base Layer',
    type: 'paint',
    objects: [],
    visible: true,
    opacity: 1,
    zIndex: 0,
    locked: false,
    blendMode: 'normal',
    isDirty: true,
    lastModifiedAt: Date.now(),
  }]);
  const [activeLayer, setActiveLayer] = useState<Layer>(layers[0]);
  const [wsService, setWsService] = useState<any>(null);
  const [switchingLayer, setSwitchingLayer] = useState<boolean>(false);
  
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
      // Use project ID from session context as room ID
      const roomId = sessionProjectId || 'default-room';
      const wsURL = 'http://localhost:5000';
      const ws = new WebSocketService(wsURL,userId, roomId);
      ws.setCanvas(canvas);
      setWsService(ws);

    }
  }, [canvas, wsService, sessionProjectId]);

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
      blendMode: 'normal',
      isDirty: true,
      lastModifiedAt: Date.now(),
    };
    setLayers([...layers, newLayer]);
    setActiveLayer(newLayer);
  };

  // Add an asset layer with an image from the Asset Vault
  const addAssetLayer = async (
    assetId: string,
    assetName: string,
    imageData: string,
    width: number,
    height: number,
    x?: number,
    y?: number
  ): Promise<Layer | null> => {
    if (!canvas) return null;

    const newLayerId = `asset-layer-${Date.now()}`;
    
    // Create the new asset layer
    const newLayer: Layer = {
      id: newLayerId,
      name: assetName,
      type: 'asset',
      objects: [],
      visible: true,
      opacity: 1,
      zIndex: layers.length,
      locked: false,
      blendMode: 'normal',
      assetId: assetId,
      assetImageData: imageData,
    };

    // Load the image and add to canvas
    try {
      const img = await fabric.FabricImage.fromURL(imageData);
      
      // Position the image (center if no position specified)
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const posX = x !== undefined ? x : (canvasWidth - width) / 2;
      const posY = y !== undefined ? y : (canvasHeight - height) / 2;

      img.set({
        left: posX,
        top: posY,
        scaleX: width / (img.width || width),
        scaleY: height / (img.height || height),
        // Make fully selectable and transformable
        selectable: true,
        evented: true,
        // Enable all transformation controls
        hasControls: true,
        hasBorders: true,
        lockMovementX: false,
        lockMovementY: false,
        lockRotation: false,
        lockScalingX: false,
        lockScalingY: false,
        lockSkewingX: false,
        lockSkewingY: false,
        // Enable corner controls for scaling
        cornerSize: 12,
        cornerColor: '#2b6cee',
        cornerStrokeColor: '#ffffff',
        cornerStyle: 'circle',
        transparentCorners: false,
        // Enable rotation control
        centeredRotation: true,
        // Border styling
        borderColor: '#2b6cee',
        borderScaleFactor: 2,
        // Custom properties
        layerId: newLayerId,
        id: uuidv4(),
      });

      // Add to canvas
      canvas.add(img);
      
      // Ensure canvas is in selection mode so the asset can be transformed
      canvas.isDrawingMode = false;
      canvas.selection = true;
      
      // Set the asset as the active object so user can immediately transform it
      canvas.setActiveObject(img);
      canvas.requestRenderAll();

      // Update layers state
      setLayers(prev => [...prev, newLayer]);
      setActiveLayer(newLayer);

      console.log('Asset layer created:', assetName, 'with asset ID:', assetId);
      return newLayer;
    } catch (error) {
      console.error('Failed to create asset layer:', error);
      return null;
    }
  };

  // Check if drawing is allowed on the current active layer
  const isDrawingAllowed = useCallback((): boolean => {
    const layer = activeLayerRef.current;
    if (layer.locked) {
      console.log('Drawing not allowed on locked layer:', layer.name);
      return false;
    }
    const constraints = getLayerConstraints(layer.type);
    if (!constraints.allowDrawing) {
      console.log('Drawing not allowed on', layer.type, 'layer:', layer.name);
      return false;
    }
    return true;
  }, []);

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
        ? { ...layer, visible, isDirty: true, lastModifiedAt: Date.now() } 
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
  };

  const updateLayerBlendMode = (layerId: string, blendMode: string) => {
    if (!canvas) return;
    setLayers(layers.map(layer => 
      layer.id === layerId 
        ? { ...layer, blendMode: blendMode as BlendMode, isDirty: true, lastModifiedAt: Date.now() } 
        : layer
    ));
  }

  //Setting layer type to non paint modes makes it non-editable
  const updateLayerType = (layerId: string, type: string) => {
    if (!canvas) return;
    setLayers(layers.map(layer =>
      layer.id === layerId
        ? { ...layer, type: type as LayerType, isDirty: true, lastModifiedAt: Date.now() }
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
        ? { ...layer, opacity, isDirty: true, lastModifiedAt: Date.now() } 
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
      setLayers(
        prev => prev.map(layer =>
          layer.id === layerId ? { ...layer, locked: !layer.locked } : layer
        )
      )
    }

  // Note: updateObjectZIndices function has been removed as it was not being used
  // The z-index management is now handled by reorderLayers function
    
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
    
    // Check if drawing is allowed on this layer type
    // Asset layers, background plates, lighting overlays should not allow new paint strokes
    const layerConstraints = getLayerConstraints(currentActiveLayer.type);
    if (!layerConstraints.allowDrawing || currentActiveLayer.locked) {
      const reason = currentActiveLayer.locked 
        ? `locked layer: ${currentActiveLayer.name}` 
        : `${currentActiveLayer.type} layer: ${currentActiveLayer.name}`;
      console.warn('Cannot draw on', reason);
      // Remove the object that was just added
      if (canvas) {
        canvas.remove(object);
        canvas.requestRenderAll();
      }
      return;
    }
    
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
          ? { ...layer, objects: [...layer.objects, objectId], isDirty: true, lastModifiedAt: Date.now() }
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
    
    // Get current layers from REF (not state) to avoid stale closure
    console.log('Current layers from ref:', layersRef.current.map(l => `${l.name}(${l.id})`));
    const currentLayers = [...layersRef.current];
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

  // Mark all layers as clean after a successful snapshot save
  const markLayersClean = useCallback((snapshotId: string) => {
    setLayers(prev => prev.map(layer => ({
      ...layer,
      isDirty: false,
      lastSnapshotId: snapshotId,
    })));
  }, []);

  // Manually mark a specific layer as dirty (e.g., after object:modified events)
  const markLayerDirty = useCallback((layerId: string) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId
        ? { ...layer, isDirty: true, lastModifiedAt: Date.now() }
        : layer
    ));
  }, []);

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
    locked?: boolean;
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
      locked: sl.locked ?? false,
      blendMode: (sl.blendMode as BlendMode) || 'normal',
    }));
    
    // Update layers state
    setLayers(newLayers);
    
    // Also update the ref directly for immediate access (before useEffect runs)
    layersRef.current = newLayers;
    
    // Set first layer as active (top layer)
    if (newLayers.length > 0) {
      setActiveLayer(newLayers[0]);
      activeLayerRef.current = newLayers[0];
    }
    
    console.log('Restored layers from snapshot:', newLayers.map(l => `${l.name}(z:${l.zIndex})`));
  }, [canvas]);


  return {
    layers,
    setLayers,
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
    updateLayerBlendMode,
    switchLayer,
    reorderLayers,
    restoreLayersFromSnapshot,
    addAssetLayer,
    isDrawingAllowed,
    markLayersClean,
    markLayerDirty,
  }
};