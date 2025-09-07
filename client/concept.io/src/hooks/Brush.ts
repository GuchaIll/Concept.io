import { useState, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { EraserBrush } from "@erase2d/fabric";
import { RGBAColor, rgbaToString } from './Color';

type BrushType = 'pencil' | 'hline' | 'vline' | 'square' | 'diamond' | 'texture' | string;

interface BrushSettings {
  brushType: BrushType;
  color: RGBAColor;
  lineWidth: number;
  brushOpacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffset: number;
}

const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  brushType: 'pencil',
  color: { r: 0, g: 0, b: 0, a: 1 },
  lineWidth: 5,
  brushOpacity: 1,
  shadowColor: '#000000',
  shadowBlur: 0,
  shadowOffset: 0
};

/**
 * Custom hook for managing brushes in fabric.js canvas
 */
export function useBrush(canvas: fabric.Canvas | null) {
  // Brush state
  const [brushType, setBrushType] = useState<BrushType>(DEFAULT_BRUSH_SETTINGS.brushType);
  const [color, setColor] = useState<RGBAColor>(DEFAULT_BRUSH_SETTINGS.color);
  const [lineWidth, setLineWidth] = useState<number>(DEFAULT_BRUSH_SETTINGS.lineWidth);
  const [brushOpacity, setBrushOpacity] = useState<number>(DEFAULT_BRUSH_SETTINGS.brushOpacity);
  const [shadowColor, setShadowColor] = useState<string>(DEFAULT_BRUSH_SETTINGS.shadowColor);
  const [shadowBlur, setShadowBlur] = useState<number>(DEFAULT_BRUSH_SETTINGS.shadowBlur);
  const [shadowOffset, setShadowOffset] = useState<number>(DEFAULT_BRUSH_SETTINGS.shadowOffset);
  const [eraseModeOn, setEraseModeOn] = useState<boolean>(false);
  const [initializedBrush, setInitializedBrush] = useState<boolean>(false);

  // Brush references
  const eraserBrush = useRef<EraserBrush | null>(null);
  const vLinePatternBrush = useRef<fabric.PatternBrush | null>(null);
  const hLinePatternBrush = useRef<fabric.PatternBrush | null>(null);
  const squarePatternBrush = useRef<fabric.PatternBrush | null>(null);
  const diamondPatternBrush = useRef<fabric.PatternBrush | null>(null);
  const texturePatternBrush = useRef<fabric.PatternBrush | null>(null);

  /**
   * Initialize all pattern brushes
   */
  const initializePatternBrushes = (): void => {
    if (!canvas || !fabric.PatternBrush || initializedBrush) return;

    setInitializedBrush(true);

    // Vertical line brush
    vLinePatternBrush.current = new fabric.PatternBrush(canvas);
    vLinePatternBrush.current.getPatternSrc = function () {
      const patternCanvas = fabric.getEnv().document.createElement('canvas');
      patternCanvas.width = 10;
      patternCanvas.height = 10;

      const ctx = patternCanvas.getContext('2d');
      if (!ctx) return patternCanvas;

      ctx.strokeStyle = this.color || '#000';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(10, 5);
      ctx.stroke();

      return patternCanvas;
    };

    // Horizontal lines brush
    hLinePatternBrush.current = new fabric.PatternBrush(canvas);
    hLinePatternBrush.current.getPatternSrc = function () {
      const patternCanvas = fabric.util.createCanvasElement();
      patternCanvas.width = patternCanvas.height = 10;
      const ctx = patternCanvas.getContext('2d');
      if (!ctx) return patternCanvas;

      ctx.strokeStyle = this.color || '#000';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(5, 10);
      ctx.closePath();
      ctx.stroke();
      return patternCanvas;
    };

    // Square brush
    squarePatternBrush.current = new fabric.PatternBrush(canvas);
    squarePatternBrush.current.getPatternSrc = function () {
      const squareWidth = 10,
      squareDistance = 2;

      const patternCanvas = fabric.getEnv().document.createElement('canvas');
      patternCanvas.width = squareWidth + squareDistance;
      patternCanvas.height = squareWidth + squareDistance;

      const ctx = patternCanvas.getContext('2d');
      if (!ctx) return patternCanvas;

      ctx.fillStyle = this.color || '#000';
      ctx.fillRect(0, 0, squareWidth, squareWidth);

      return patternCanvas;
    };

    // Diamond pattern brush
    diamondPatternBrush.current = new fabric.PatternBrush(canvas);
    diamondPatternBrush.current.getPatternSrc = function () {
      const squareWidth = 10,
      squareDistance = 5;

      const patternCanvas = fabric.getEnv().document.createElement('canvas');
      const rect = new fabric.Rect({
        width: squareWidth,
        height: squareWidth,
        angle: 45,
        fill: this.color || '#000',
      });

      const canvasWidth = rect.getBoundingRect().width;

      patternCanvas.width = canvasWidth + squareDistance;
      patternCanvas.height = canvasWidth + squareDistance;
      rect.set({
        left: squareDistance / 2,
        top: squareDistance / 2,
      });

      const ctx = patternCanvas.getContext('2d');
      if (ctx) rect.render(ctx);

      return patternCanvas;
    };

    // Texture pattern brush
    const img = new Image();
    img.src = 'https://fabricjs.com/assets/ladybug.png';
    img.onload = () => {
      texturePatternBrush.current = new fabric.PatternBrush(canvas);
      texturePatternBrush.current.source = img;
    };

    // Eraser brush
    eraserBrush.current = new EraserBrush(canvas);
    eraserBrush.current.width = lineWidth;
  };

  /**
   * Update the current brush based on settings
   */
  const updateBrush = (): void => {
    if (!canvas) return;

    // Handle eraser mode
    if (eraseModeOn) {
      if (!eraserBrush.current) {
        eraserBrush.current = new EraserBrush(canvas);
      }
      canvas.freeDrawingBrush = eraserBrush.current;
      canvas.freeDrawingBrush.width = lineWidth;
      return;
    }

    // Select brush based on type
    let brush: fabric.BaseBrush | null = null;

    switch (brushType) {
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
        const BrushClass = (fabric as any)[`${brushType}Brush`];
        brush = BrushClass ? new BrushClass(canvas) : new fabric.PencilBrush(canvas);
        break;
    }

    if (brush) {
      const colorWithOpacity = { ...color, a: brushOpacity };
      brush.color = rgbaToString(colorWithOpacity);
      brush.width = lineWidth;

      brush.shadow = new fabric.Shadow({
        blur: shadowBlur,
        offsetX: shadowOffset,
        offsetY: shadowOffset,
        affectStroke: true,
        color: shadowColor,
      });

      canvas.freeDrawingBrush = brush;
    }
  };

  /**
   * Toggle eraser mode
   */
  const toggleEraseMode = (): void => {
    if (!canvas) return;

    const newEraseMode = !eraseModeOn;
    setEraseModeOn(newEraseMode);

    if (newEraseMode) {
      if (!eraserBrush.current) {
        eraserBrush.current = new EraserBrush(canvas);
      }
      canvas.freeDrawingBrush = eraserBrush.current;
      canvas.freeDrawingBrush.width = lineWidth;

      // Make all existing objects erasable
      canvas.getObjects().forEach((obj) => {
        obj.erasable = true;
      });
    } else {
      updateBrush();
    }
  };

  // Update brush when settings change
  useEffect(() => {
    if (!canvas) return;
    if (!initializedBrush) initializePatternBrushes();
    updateBrush();
  }, [
    canvas, 
    brushType, 
    color, 
    lineWidth, 
    shadowColor, 
    shadowBlur, 
    shadowOffset, 
    eraseModeOn, 
    brushOpacity
  ]);

  return {
    // State
    brushType,
    setBrushType,
    color,
    setColor,
    lineWidth,
    setLineWidth,
    brushOpacity,
    setBrushOpacity,
    shadowColor,
    setShadowColor,
    shadowBlur,
    setShadowBlur,
    shadowOffset,
    setShadowOffset,
    eraseModeOn,
    setEraseModeOn,

    // Actions
    updateBrush,
    toggleEraseMode
  };
}