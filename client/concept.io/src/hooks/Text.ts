import { useEffect, useState, useCallback} from 'react';
import * as fabric from 'fabric';
import { FabricHelper } from './FabricHelper';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextProperties {
  fontSize: number;
  fontFamily: string;
  align: TextAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

const deleteObject = (eventData: fabric.TPointerEvent, transform: fabric.Transform) => {
    const target = transform.target;
    const canvas = target.canvas;
    canvas?.remove(target);
    canvas?.requestRenderAll();
    return true;
};

const addCustomControls = (newTextBox : fabric.IText) => {
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

const renderDeleteControl = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: fabric.Object) => {
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

export const useText = (canvas: fabric.Canvas | null) => {
  
  const [textProps, setTextProps] = useState<TextProperties>({
    fontSize: 16,
    fontFamily: 'Arial',
    align: 'left',
    bold: false,
    italic: false,
    underline: false,
  });

  const [selectedTextObject, setSelectedTextObject] = useState<fabric.IText | null>(null);
  const [textToolActive, setTextToolActive] = useState<boolean>(false);

  const addTextBox = (options: fabric.TEvent<MouseEvent | TouchEvent>): void => {
    console.log("Adding text box at:", textToolActive, canvas);
    if (!textToolActive || !canvas) return;

    // Check if we clicked on an existing text object
    const clickedObject = canvas.findTarget(options.e);
    if (clickedObject && (clickedObject.type === 'i-text' || clickedObject.type === 'textbox')) {
      // If we clicked a text object, just enter edit mode
      canvas.setActiveObject(clickedObject);
      (clickedObject as fabric.Textbox).enterEditing();
      canvas.requestRenderAll();
      return;
    }

    // Get correct pointer coordinates
    const pointer = canvas.getScenePoint(options.e);

    // Create text box with proper positioning
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
      fill: '#999999', // Light gray for placeholder text
      
    });

    textBox.on('editing:entered', () => {
      
        textBox.text = '';
        textBox.fill = canvas.freeDrawingBrush?.color || '#000000';
        canvas.requestRenderAll();
        
    });


    addCustomControls(textBox);
    canvas.add(textBox);
    canvas.setActiveObject(textBox);
    // Enter edit mode immediately
    textBox.enterEditing();
    canvas.renderAll();
  }

   const activateTextTool = () => {
    if (!canvas) return;
    setTextToolActive(true);

    // Disable drawing mode and selection
    canvas.isDrawingMode = false;
    canvas.selection = false;
    
    // Set cursor to text
    canvas.defaultCursor = 'text';
    canvas.hoverCursor = 'text';
     

     console.log("Text tool activated");
    
    //Mouse movements binded in useEffect
  };

  const deactivateTextTool = () => {
    console.log("Text tool deactivated");
    if (!canvas) return;
    // Reset cursors
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    
    // Re-enable selection
    canvas.selection = true;
    canvas.isDrawingMode = true;
    
    setTextToolActive(false);
    setSelectedTextObject(null)

    canvas.off('selection:created');
    
   
  };

  useEffect(() =>{
    if (selectedTextObject) {
      selectedTextObject.fontSize = textProps.fontSize;
      selectedTextObject.fontFamily = textProps.fontFamily;
      selectedTextObject.textAlign = textProps.align;
      selectedTextObject.fontWeight = textProps.bold ? 'bold' : 'normal';
      selectedTextObject.fontStyle = textProps.italic ? 'italic' : 'normal';
      selectedTextObject.underline = textProps.underline;
      canvas?.requestRenderAll();
    }
  }, [selectedTextObject, textProps]);

  useEffect(() => {
    if (!canvas) return;

    const cleanup = () => {
      canvas.off('mouse:down', addTextBox as any);
      canvas.off('selection:created');
    };

    
    if (textToolActive) {
      console.log("Binding mouse down for text tool");
      cleanup(); // Remove any existing listeners first
      canvas.on('mouse:down', addTextBox as any);
      
      canvas.on('selection:created', (e) => {
        const selectedObject = canvas.getActiveObject();
        if (selectedObject && selectedObject.type === 'i-text') {
          setSelectedTextObject(selectedObject as fabric.IText);
          // ...existing property updates...
        }
      });
    } else {
      cleanup(); // Remove listeners when tool is deactivated
    }

    return cleanup;
    
  }, [textToolActive]);

 

  return {
    textProps,
    setTextProps,
    textToolActive,
    setTextToolActive,
    activateTextTool,
    deactivateTextTool
  };
};

