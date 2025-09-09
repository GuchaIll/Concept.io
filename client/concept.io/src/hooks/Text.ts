// Temporary file to get the correct implementation
import { useEffect, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { useTool } from '../contexts/ToolContext';

export type TextAlign = 'left' | 'center' | 'right';
export type FontFamily = 'Arial' | 'Times New Roman' | 'Helvetica' | 'Courier New' | 'Georgia';

export interface TextProperties {
  fontSize: number;
  fontFamily: FontFamily;
  align: TextAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface TextHookResult {
  textProps: TextProperties;
  setTextProps: (props: TextProperties) => void;
  selectedTextObject: fabric.IText | null;
  setSelectedTextObject: (obj: fabric.IText | null) => void;
}

const deleteObject = (_eventData: fabric.TPointerEvent, transform: fabric.Transform) => {
  const target = transform.target;
  const canvas = target.canvas;
  canvas?.remove(target);
  canvas?.requestRenderAll();
  return true;
};

const renderDeleteControl = (ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, fabricObject: fabric.Object) => {
  const size = 16;
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle || 0));
  
  // Draw circle background
  ctx.beginPath();
  ctx.arc(0, 0, size/2, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fill();
  ctx.strokeStyle = '#FF0000';
  ctx.stroke();
  
  // Draw X
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FF0000';
  ctx.moveTo(-size/4, -size/4);
  ctx.lineTo(size/4, size/4);
  ctx.moveTo(size/4, -size/4);
  ctx.lineTo(-size/4, size/4);
  ctx.stroke();
  
  ctx.restore();
};

const addCustomControls = (newTextBox: fabric.IText) => {
  if (!newTextBox.controls) {
    newTextBox.controls = {...fabric.IText.prototype.controls};
  }

  newTextBox.controls.deleteControl = new fabric.Control({
    x: 0.5,
    y: -0.5,
    offsetY: -16,
    offsetX: 16,
    cursorStyle: 'pointer',
    mouseUpHandler: deleteObject,
    render: renderDeleteControl,
    sizeX: 24,
    sizeY: 24,
    touchSizeX: 24,
    touchSizeY: 24,
  });

  newTextBox.setControlsVisibility({
    deleteControl: true,
  });

  newTextBox.setCoords();
  newTextBox.canvas?.requestRenderAll();
};

export const useText = (canvas: fabric.Canvas | null): TextHookResult => {
  const { state: toolState } = useTool();
  const isTextToolActive = toolState.activeToolId === 'text';
  
  const [textProps, setTextProps] = useState<TextProperties>({
    fontSize: 16,
    fontFamily: 'Arial',
    align: 'left',
    bold: false,
    italic: false,
    underline: false,
  });

  const [selectedTextObject, setSelectedTextObject] = useState<fabric.IText | null>(null);

  const addTextBox = useCallback((event: fabric.TEvent<MouseEvent | TouchEvent>): void => {
    if (!canvas || !isTextToolActive) return;

    // Check if we clicked on an existing text object
    const clickedObject = canvas.findTarget(event.e);
    if (clickedObject && (clickedObject.type === 'i-text' || clickedObject.type === 'textbox')) {
      canvas.setActiveObject(clickedObject);
      (clickedObject as fabric.IText).enterEditing();
      canvas.requestRenderAll();
      return;
    }

   
    const pointer = canvas.getScenePoint(event.e);

    // Create new text box
    const textBox = new fabric.IText('Enter text', {
      left: pointer.x,
      top: pointer.y,
      fontSize: textProps.fontSize,
      fontFamily: textProps.fontFamily,
      textAlign: textProps.align,
      fontWeight: textProps.bold ? 'bold' : 'normal',
      fontStyle: textProps.italic ? 'italic' : 'normal',
      underline: textProps.underline,
      editable: true,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      borderColor: 'blue',
      cornerColor: 'red',
      cornerSize: 8,
      cornerStyle: 'circle',
      transparentCorners: false,
      padding: 10,
      activeOnScale: true,
      fill: '#999999'
    });

    // Set up text box behavior
    textBox.on('editing:entered', () => {
      textBox.text = '';
      if (canvas.freeDrawingBrush?.color) {
        textBox.fill = canvas.freeDrawingBrush.color;
      }
      canvas.requestRenderAll();
    });

    // Add custom controls 
    addCustomControls(textBox);
    canvas.add(textBox);
    canvas.setActiveObject(textBox);
    textBox.enterEditing();
    canvas.renderAll();
  }, [canvas, isTextToolActive, textProps]);

  // Update text object properties when textProps change
  useEffect(() => {
    if (selectedTextObject && canvas) {
      selectedTextObject.set({
        fontSize: textProps.fontSize,
        fontFamily: textProps.fontFamily,
        textAlign: textProps.align,
        fontWeight: textProps.bold ? 'bold' : 'normal',
        fontStyle: textProps.italic ? 'italic' : 'normal',
        underline: textProps.underline
      });
      canvas.requestRenderAll();
    }
  }, [selectedTextObject, textProps, canvas]);

  // Handle text tool activation and mouse events
  useEffect(() => {
    if (!canvas) return;

    const cleanup = () => {
      canvas.off('mouse:down', addTextBox);
      canvas.off('selection:created');
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.selection = true;
      setSelectedTextObject(null);
    };

    if (isTextToolActive) {
      // Configure canvas for text tool
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.defaultCursor = 'text';
      canvas.hoverCursor = 'text';

      // Set up event listeners
      canvas.on('mouse:down', addTextBox);
      canvas.on('selection:created', () => {
        const selectedObject = canvas.getActiveObject();
        if (selectedObject && selectedObject.type === 'i-text') {
          setSelectedTextObject(selectedObject as fabric.IText);
        }
      });
    } else {
      cleanup();
    }

    return cleanup;
  }, [isTextToolActive, canvas, addTextBox]);

  return {
    textProps,
    setTextProps,
    selectedTextObject,
    setSelectedTextObject
  };
};
