import React, {useEffect, useState, useRef} from 'react'
import * as fabric from 'fabric';
import { EraserBrush, ClippingGroup } from "@erase2d/fabric";

const FCanvas = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
    const [drawingModeOn, setDrawingModeOn] = useState<boolean>(true);
    const [eraseModeOn, setEraseModeOn] = useState<boolean>(false);

    const drawingModeRef = useRef<HTMLButtonElement | null>(null);
    const drawingColorRef = useRef<HTMLButtonElement | null>(null);
    const eraseButton = useRef<HTMLButtonElement | null>(null);
    const clearRef = useRef<HTMLButtonElement | null>(null);

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

     useEffect(() => {
      console.log("creatting new canvas");
    // create Fabric canvas once
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
    console.log("undo action")
  }

  const handleRedo = () => {
    console.log("Redo action");
  }

   return(
    <>
    <div className = "flex-col justify-center bg-yellow-200 w-full max-h-32 rounded">
      <div className = "flex gap-2">
         <button
          ref={drawingModeRef}
          onClick={handleToggleDrawing}
          className={`text-white px-4 py-2 rounded ${
            drawingModeOn ? 'bg-green-600 hover:bg-green-700' : 'bg-red-400 hover:bg-red-500'
          } transition-colors duration-300`}
        >
          {drawingModeOn ? 'Drawing Mode: ON' : 'Drawing Mode: OFF'}
        </button>
        <button ref={clearRef} onClick={handleClearCanvas} className="bg-red-500 text-white px-4 py-2 rounded ml-2">Clear Canvas</button>
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