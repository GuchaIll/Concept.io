import React, {useEffect, useState, useRef} from 'react'
import * as fabric from 'fabric';
import { EraserBrush, ClippingGroup } from "@erase2d/fabric";
import { v4 as uuidv4 } from 'uuid';
import Stack from "../common/Stack";

declare module 'fabric' {
  export interface FabricObject {
    id?: string;
  }
}

class FabricHelper {
  private canvas: fabric.Canvas;

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas;
  }

  public findObjectById(id: string): fabric.FabricObject | null {
    let matchingObject= null;
    this.canvas.getObjects().map(obj => {
      if (obj.id === id) {
        matchingObject = obj;
      }
    });
    return matchingObject;
  }

}
interface Layer {
  id: string;
  name: string;
  objects: string[]; // array of object ids
  visible: boolean;
  opacity: number;
  zIndex: number;
  group?: string; //group id
}

const FCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [fabricHelper, setFabricHelper] = useState<FabricHelper | null>(null);
    const [drawingModeOn, setDrawingModeOn] = useState<boolean>(true);
    const [eraseModeOn, setEraseModeOn] = useState<boolean>(false);

    const drawingModeRef = useRef<HTMLButtonElement | null>(null);
    const drawingColorRef = useRef<HTMLButtonElement | null>(null);
    const eraseButton = useRef<HTMLButtonElement | null>(null);
    const clearRef = useRef<HTMLButtonElement | null>(null);

    const undoStack = useRef<Stack<fabric.Object | null>>(new Stack());
    const redoStack = useRef<Stack<fabric.Object | null>>(new Stack());

    //Brush parameters
    const [brushType, setBrushType] = useState<string>('pencil');
    const [color, setColor] = useState<string>('#000000');
    const [lineWidth, setLineWidth] = useState<number>(5);
    const [shadowColor, setShadowColor] = useState<string>('#000000');
    const [shadowBlur, setShadowBlur] = useState<number>(0);
    const [shadowOffset, setShadowOffset] = useState<number>(0);

    //Pattern brushes refs

    const vLinePatternBrush = useRef<fabric.PatternBrush | null>(null);
    const hLinePatternBrush = useRef<fabric.PatternBrush | null>(null);
    const squarePatternBrush = useRef<fabric.PatternBrush | null>(null);
    const diamondPatternBrush = useRef<fabric.PatternBrush | null>(null);
    const texturePatternBrush = useRef<fabric.PatternBrush | null>(null);
    const eraserBrush = useRef<EraserBrush | null>(null);

    //layer information
    const [layers, setLayers] = useState<Layer[]>([
      {
        id: 'base',
        name: 'Base Layer',
        objects: [],
        visible: true,
        opacity: 1,
        zIndex: 0
      }
    ]);
    const [activeLayer, setActiveLayer] = useState<Layer | null>(layers[0]);

    const createLayerGroup = (objects : fabric.Object[], opacity : number) => {
      if(!canvas) return;
      const group = new fabric.Group(objects, {
        opacity: opacity,
        evented: true,
        selectable: true
      });
      return group
    }

    const addObjectToLayer = (object : fabric.FabricObject , layerId : string) => {
      if (!canvas || !fabricHelper) return;

      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;

      layer.objects.push(object.id as string);
      canvas.add(object);
    }

    const removeObjectFromLayer = (object : fabric.Object, layerId: string) => {
      if (!canvas || !fabricHelper) return;

      const layer = layers.find(l => l.id === layerId);
      if (!layer) return;

      layer.objects = layer.objects.filter(obj => obj !== object.id);
      canvas.remove(object);
    }

    const makeObjectsGroup = (layerId : string) => {
      const layer = layers.find(l => l.id === layerId);
      if(!layer || !canvas) return;

      let groupObjects = layer.objects.map(id => fabricHelper!.findObjectById(id)).filter(obj => obj !== null) as fabric.FabricObject[];

      let newGroup = new fabric.Group(groupObjects);
      (newGroup as any).id = uuidv4();
      newGroup.set({
        opacity: layer.opacity,
        visible: layer.visible,
        evented: true,
        selectable: true
      });
      groupObjects.forEach(obj => canvas?.remove(obj));
      canvas.add(newGroup);
      setLayers(layers.map(l => l.id === layerId ? {
        ...l,
        objects: [typeof newGroup.id === 'string' ? newGroup.id : ''],
        group: typeof newGroup.id === 'string' ? newGroup.id : undefined
      } : l));

    }


    const handleObjectAdded = (options: { target: fabric.FabricObject }) => {
      const addedObject = options.target;
      if (!addedObject || !canvas || !activeLayer) return;

      console.log("handleObject called");
      // Add the new object to the active layer
      const objectId = uuidv4();
      addedObject.id = objectId; // Assign a unique ID to the object
      addObjectToLayer(addedObject, activeLayer.id);

      if(activeLayer.group)
      {
        const group = fabricHelper?.findObjectById(activeLayer.group) as fabric.Group;
        if(group)
        {
          canvas.remove(addedObject);
          const objects = group.getObjects();
          objects.push(addedObject);

          const newGroup = new fabric.Group(objects);
          newGroup.id = uuidv4();
          canvas.add(newGroup);
          console.log("New group created:", newGroup);
        }
      
      }
      else{
        const newGroup = createLayerGroup([addedObject], activeLayer.opacity);
        if(newGroup)
        {
          canvas.add(newGroup);
          console.log("New group created:", newGroup);
        }
      }
    }

    const updateLayerVisibilityOpacity = (layerID : string, visible: boolean) => 
    {
      if(!canvas ) return;

      const layer = layers.find(l => l.id === layerID )
      if(!layer || !layer.group) return;

      const updatedGroup = fabricHelper!.findObjectById(layer.group! ) as fabric.Group;
      updatedGroup.set('visible', visible);
      updatedGroup.set('opacity', layer.opacity);
      canvas.renderAll();

    }

    const addLayer = () => {
      const newLayer: Layer = {
        id: `layer-${layers.length + 1}`,
        name: `Layer ${layers.length + 1}`,
        objects: [],
        visible: true,
        opacity: 1,
        zIndex: layers.length
      };
      setLayers([...layers, newLayer]);
      setActiveLayer(newLayer);
    }

    //TODO: update the visual representation of layers
    const removeLayer = (layerID: string) => {
      const layerToRemove = layers.find(l => l.id === layerID);
      if (!layerToRemove || !canvas || !fabricHelper) return;

      // Remove the layer from the canvas
      layerToRemove.objects.forEach(obj => {
        const objFound = fabricHelper.findObjectById(obj);
        if (objFound) {
          canvas.remove(objFound);
        }
      });

      // Update the layers state
      setLayers(layers.filter(l => l.id !== layerID));
      setActiveLayer(layers[0]);
    }

    // Clear canvas
    const handleClearCanvas = () => {
      console.log("Clear button clicked");
      if (!canvas) return;
      canvas.clear();
    }

    const handleToggleDrawing = () => {
    
      if (!canvas) return;
      canvas.isDrawingMode = !canvas.isDrawingMode;
      setDrawingModeOn(!drawingModeOn);
    }

    const initializePatternBrushes = () => {
      if(canvas && fabric.PatternBrush) {

        //vertical line brush
        vLinePatternBrush.current = new fabric.PatternBrush(canvas);
        vLinePatternBrush.current.getPatternSrc = function () {
          const patternCanvas = fabric.getEnv().document.createElement('canvas');
          patternCanvas.width = 10;
        patternCanvas.height = 10;

        const ctx = patternCanvas.getContext('2d');

        ctx!.strokeStyle = this.color;
        ctx!.lineWidth = 5;
        ctx!.beginPath();
        ctx!.moveTo(0, 5);
        ctx!.lineTo(10, 5);
        ctx!.stroke();

        return patternCanvas;
      };

      // Horizontal lines brush
    hLinePatternBrush.current = new fabric.PatternBrush(canvas);
    hLinePatternBrush.current.getPatternSrc = function () {
      const patternCanvas = fabric.util.createCanvasElement();
      patternCanvas.width = patternCanvas.height = 10;
      const ctx = patternCanvas.getContext('2d')!;
      ctx.strokeStyle = this.color!;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(5, 10);
      ctx.closePath();
      ctx.stroke();
      return patternCanvas;
    };

      //square brush
      squarePatternBrush.current = new fabric.PatternBrush(canvas);
      squarePatternBrush.current.getPatternSrc = function () {
        const squareWidth = 10,
        squareDistance = 2;

        const patternCanvas = fabric.getEnv().document.createElement('canvas');
        patternCanvas.width = squareWidth + squareDistance;
        patternCanvas.height = squareWidth + squareDistance;

        const ctx = patternCanvas.getContext('2d');

        ctx!.fillStyle = this.color;
        ctx!.fillRect(0, 0, squareWidth, squareWidth);

        return patternCanvas;
      };

      //diamond pattern brush
      diamondPatternBrush.current = new fabric.PatternBrush(canvas);
      diamondPatternBrush.current.getPatternSrc = function () {
        const squareWidth = 10,
        squareDistance = 5;

        const patternCanvas = fabric.getEnv().document.createElement('canvas');
        const rect = new fabric.Rect({
          width: squareWidth,
          height: squareWidth,
          angle: 45,
          fill: this.color,
        })

        const canvasWidth = rect.getBoundingRect().width;

        patternCanvas.width = canvasWidth + squareDistance;
        patternCanvas.height = canvasWidth + squareDistance;
        rect.set({
          left: squareDistance / 2,
          top: squareDistance / 2,
        });
        
        const ctx = patternCanvas.getContext('2d');
        if(ctx)rect.render(ctx);

        return patternCanvas;
      };

      //texture pattern brush
      const img = new Image
      img.src = 'https://fabricjs.com/assets/ladybug.png';
      img.onload = () => {
        texturePatternBrush.current = new fabric.PatternBrush(canvas);
        texturePatternBrush.current.source = img;
      };

      //eraser brush
      eraserBrush.current = new EraserBrush(canvas);
      eraserBrush.current.width = lineWidth;

    }
  }

  //initialization set up for canvs
     useEffect(() => {
      console.log("creating new canvas");
   
    const canvas = new fabric.Canvas(canvasRef.current!, {
      height: window.innerHeight,
      width: window.innerWidth,
      backgroundColor: 'pink',
      isDrawingMode: true,
    });

    setCanvas(canvas);

     canvas.getObjects().forEach((obj) => {
    if (obj instanceof fabric.Path) {
      obj.erasable = true;
      }
    });

    const fabricHelper = new FabricHelper(canvas);
    setFabricHelper(fabricHelper);

    initializePatternBrushes();

    updateBrush();

    window.addEventListener("keydown", handleKeyDown);

    // cleanup on unmount
    return () => {
      canvas.dispose();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  //update free drawing brush when parameters or the brush type changes

  
  const handleErase = () => {
     if (!canvas) return;

    setEraseModeOn(!eraseModeOn);
     if(eraseModeOn){
      if(!eraserBrush.current){
        eraserBrush.current = new EraserBrush(canvas);
      }
      canvas.freeDrawingBrush = eraserBrush.current;
      canvas.freeDrawingBrush.width = lineWidth;

      //make all existing objects erasable
       canvas.getObjects().forEach((obj) => {
        obj.erasable = true;
     });
     }
     else{
        updateBrush();
     }
  }

  const updateBrush = () => {
    if (canvas ) {
      
      if(eraseModeOn) {
        if (!eraserBrush.current) {
          eraserBrush.current = new EraserBrush(canvas);
        }
        canvas.freeDrawingBrush = eraserBrush.current;
        canvas.freeDrawingBrush.width = lineWidth;
        return;
      }

      let brush : fabric.BaseBrush | null = null;

      switch(brushType){
        case 'hline':
          brush = hLinePatternBrush.current;
          break;
        case 'vline':
          brush = vLinePatternBrush.current;
          break;
        case 'square':
          brush = squarePatternBrush.current;
          break;
        case 'diamond':
          brush = diamondPatternBrush.current;
          break;
        case 'texture':
          brush = texturePatternBrush.current;
          break;
        
        default:
          const BrushClass = (fabric as any)[brushType + 'Brush'];
          brush = BrushClass ? new BrushClass(canvas) : new fabric.PencilBrush(canvas);
          break;
      }

      if(brush)
      {
        brush.color = color;
        brush.width = lineWidth;
        brush.shadow = new fabric.Shadow(
          {
            blur: shadowBlur,
            offsetX: shadowOffset,
            offsetY: shadowOffset,
            affectStroke: true,
            color: shadowColor,
          }
        );
        canvas.freeDrawingBrush = brush;
      }
    }
  }
  

  useEffect(() => {
  if (!canvas) return;

  canvas.on('object:added', handleObjectAdded);
    //TODO: add objects on object added
    canvas.getObjects().forEach((obj) => {
      obj.erasable = true;

  });

   updateBrush();

}, [eraseModeOn, canvas, lineWidth, color, brushType, shadowColor, shadowOffset, shadowBlur]);

  //key input handler

  const handleKeyDown = (event : KeyboardEvent) =>
  {
    if (event.key === 'z' && (
    (event.ctrlKey && event.shiftKey) || // Windows/Linux redo
    (event.metaKey && event.shiftKey)    // Mac redo
    )) {
      event.preventDefault();
      handleRedo();
    }
    else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleUndo();
    } 
  }

  const handleUndo = () => {
    console.log("undo action");

  }

  const handleRedo = () => {
    console.log("Redo action");
  }

   return(
    <>
    <div className = "flex-col justify-center bg-yellow-200 w-full max-h-32 rounded">
      <div className = "flex gap-2">
        <div className = "flex flex-col ">
         <button
          ref={drawingModeRef}
          onClick={handleToggleDrawing}
          className={`text-white px-4 py-2 h-12 rounded ${
            drawingModeOn ? 'bg-green-200 hover:bg-green-300' : 'bg-yellow-200 hover:bg-orange-200'
          } transition-colors duration-300`}
        >
          {drawingModeOn ? 'Drawing Mode: ON' : 'Drawing Mode: OFF'}
        </button>
        <button ref={clearRef} onClick={handleClearCanvas} className="bg-red-200  text-white px-4 py-2 h-12 rounded ml-2">Clear Canvas</button>
        </div>
        <div className = "flex flex-col ">
          <label className = "flex flex-col items-center ml-2 bg-gray-500 ">
            <span className = "text-center w-full mb-2">BrushType</span>
            <select value={brushType} onChange={(e)=> { setBrushType(e.target.value); }} className="ml-2">
              <option value="Pencil">Pencil</option>
              <option value="Circle">Circle</option>
              <option value="Spray">Spray</option>
              <option value="hline">Horizontal Lines</option>
              <option value="vline">Vertical Lines</option>
              <option value="square">Squares</option>
              <option value="diamond">Diamonds</option>
              <option value="texture">Texture</option>
            </select>
          </label>
          <label className = "flex flex-col items-center ml-2 bg-gray-500">
           <button ref = {eraseButton} onClick={handleErase} className={`${eraseModeOn ? 'bg-gray-500 text-white' : 'bg-gray-200 text-black'}  px-4 py-2 rounded ml-2`}>{eraseModeOn ? 'Disable Eraser' : 'Enable Eraser'}</button>
          </label>
        </div>

        
      

      <div className = "flex flex-col ">
        <label className = "flex flex-col items-center space-y-1 bg-gray-500">
          <span className = "text-center w-full">Color:</span>
          <input type = "color" value = {color} 
          onChange={(e) => { console.log("color changed:", e.target.value); setColor(e.target.value);}} 
           onClick={() => console.log("clicked")}
           onFocus={() => console.log("focused")}
          />
        </label>
        <label className = "flex flex-col items-center ml-2 bg-gray-500">
          <span className = "text-center w-full">Line Width:</span>
          <input type="number" value={lineWidth} 
          onChange={(e) => setLineWidth(parseInt(e.target.value))} 
          className="w-16 h-10 p-0 border border-gray-300 rounded bg-white"/>
        </label>
      </div>
      <div className = "flex flex-col ">
        <label className = "flex flex-col items-center space-y-1 bg-gray-500">
          <span className = "text-center w-full">Shadow Color:</span>
          <input type = "color" value = {shadowColor} onChange={(e) => setShadowColor(e.target.value)} />
        </label>
        <label className = "flex flex-col items-center ml-2 bg-gray-500">
          <span className = "text-center w-full">Shadow blur:</span>
          <input type="number" min={0} value={shadowBlur} 
          onChange={(e) => setShadowBlur(parseInt(e.target.value) || 0)} 
          className="w-16 h-10 p-0 border border-gray-300 rounded bg-white"/>
          
        </label>
        <label className = "flex flex-col items-center ml-2 bg-gray-500">
          <span className = "text-center w-full">Shadow Offset:</span>
          <input
            type="number"
            min={0}
            value={shadowOffset}
            onChange={(e) => setShadowOffset(parseInt(e.target.value) || 0)}
            className="w-16 h-10 p-0 border border-gray-300 rounded bg-white"
          />
        </label>
      </div>

      <div className = "fixed right-0 top-32 bg-gray-500  p-4 rounded-r-lg shadow-lg"> 
          <div className="flex flex-col gap-2">
            <button onClick={() => addLayer()} 
            className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded flex items-center justify-center">
              <span className="text-xl">+</span>
            </button>
            <div className = "space-y-2 min-w-[200px]">
              {layers.map((layer) => {
               return  <div 
                  key = {layer.id}
                  className = {
                    `flex items-center gap-2 p-2 rounded cursor-pointer ${
                      activeLayer!.id === layer.id ? 'bg-blue-200' : 'bg-gray-300'}`
                  }
                  onClick={() => setActiveLayer(layer)}>
                  <div className = "flex items-center gap-2 flex-1">
                    <input type = "checkbox" checked={layer.visible} 
                    onChange = {(e) => {
                      const selectedLayer = layers.map (l => l.id === layer.id ? {...l, visible: e.target.checked} : l);
                      setLayers(selectedLayer);
                      updateLayerVisibilityOpacity(layer.id, e.target.checked);
                    }}
                  className="w-4 h-4"/>
                   <span className="text-white">{layer.name}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={layer.opacity * 100}
                  onChange={(e) => {
                    const selectedLayers = layers.map(l => l.id === layer.id 
                      ? {...l, opacity: Number(e.target.value) / 100} : l);
                    setLayers(selectedLayers);
                    updateLayerVisibilityOpacity(layer.id, layer.visible);
                  }}
                  className="w-20"
                  />
                    {layers.length > 1 && (
            <button
              onClick={() => {
                const newLayers = layers.filter(l => l.id !== layer.id);
                setLayers(newLayers);
                if (activeLayer!.id === layer.id) {
                  setActiveLayer(newLayers[0]);
                }
              }}
              className="text-red-500 hover:text-red-400"
            >
              ×
            </button>
          )}
              </div>
            })}
          </div>
        </div>
        </div>
          
          <div className = "flex gap-2">
              <button
                onClick={() => {
                  handleUndo()
                }}
                className="bg-purple-200 hover:bg-purple-300 text-white p-2 rounded h-12"
              >
                Undo
              </button>
               <button
                onClick={() => {
                  handleRedo()
                }}
                className="bg-blue-200 hover:bg-blue-300 text-white p-2 rounded h-12"
              >
                Redo
              </button>
          </div>
      </div>

      <h1>Fabric.js on React - fabric.Canvas('...')</h1>
      <canvas className = "absolute border border-indigo-600 mt-10"
        width= {window.innerWidth}
        height = {window.innerHeight}
        ref = {canvasRef}
       />
    </div>
    </>
  );

}

export default FCanvas