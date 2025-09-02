import { useState, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { EraserBrush, ClippingGroup } from "@erase2d/fabric";
import type {RGBAColor} from './Color';
import {ColorToString} from './Color';


export const useBrush = (canvas: fabric.Canvas | null) => {
  const [brushType, setBrushType] = useState<string>('pencil');
  const [color, setColor] = useState<RGBAColor>({r: 0, g: 0, b: 0, a: 1});
  const [lineWidth, setLineWidth] = useState<number>(5);
  const [brushOpacity, setBrushOpacity] = useState<number>(1); 
  const [shadowColor, setShadowColor] = useState<string>('#000000');
  const [shadowBlur, setShadowBlur] = useState<number>(0);
  const [shadowOffset, setShadowOffset] = useState<number>(0);
  const [eraseModeOn, setEraseModeOn] = useState<boolean>(false);
  const [initializedBrush, setInitializedBrush] = useState<boolean>(false);

  const eraserBrush = useRef<EraserBrush | null>(null);
  const vLinePatternBrush = useRef<fabric.PatternBrush | null>(null);
  const hLinePatternBrush = useRef<fabric.PatternBrush | null>(null);
  const squarePatternBrush = useRef<fabric.PatternBrush | null>(null);
  const diamondPatternBrush = useRef<fabric.PatternBrush | null>(null);
  const texturePatternBrush = useRef<fabric.PatternBrush | null>(null);

  const initializePatternBrushes = () => {
        if(canvas && fabric.PatternBrush) {
            setInitializedBrush(true);
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
          color.a = brushOpacity;
          brush.color = ColorToString(color);
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
    
    useEffect(() => {
    if (!canvas) return;
    if(!initializedBrush) initializePatternBrushes();
    updateBrush();
    }, [canvas, brushType, color, lineWidth, shadowColor, shadowBlur, shadowOffset, eraseModeOn, brushOpacity]);

  return {
    brushType,
    setBrushType,
    color,
    setColor,
    lineWidth,
    setLineWidth,
    shadowColor,
    setShadowColor,
    shadowBlur,
    setShadowBlur,
    shadowOffset,
    setShadowOffset,
    eraseModeOn,
    setEraseModeOn,
    updateBrush,
    handleErase,
    brushOpacity,
    setBrushOpacity
  };
};