import { useEffect, useState } from 'react';
import * as fabric from 'fabric';

export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 
                    'line' | 'triangle' | 'polygon';

export interface ShapeProperties {
  fill: fabric.TFiller;
  strokeWidth: number;
}

// create a rect object
const deleteIcon =
  "data:image/svg+xml,%3C%3Fxml version='1.0' encoding='utf-8'%3F%3E%3C!DOCTYPE svg PUBLIC '-//W3C//DTD SVG 1.1//EN' 'http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd'%3E%3Csvg version='1.1' id='Ebene_1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' x='0px' y='0px' width='595.275px' height='595.275px' viewBox='200 215 230 470' xml:space='preserve'%3E%3Ccircle style='fill:%23F44336;' cx='299.76' cy='439.067' r='218.516'/%3E%3Cg%3E%3Crect x='267.162' y='307.978' transform='matrix(0.7071 -0.7071 0.7071 0.7071 -222.6202 340.6915)' style='fill:white;' width='65.545' height='262.18'/%3E%3Crect x='266.988' y='308.153' transform='matrix(0.7071 0.7071 -0.7071 0.7071 398.3889 -83.3116)' style='fill:white;' width='65.544' height='262.179'/%3E%3C/g%3E%3C/svg%3E";

var deleteImg = document.createElement('img');
deleteImg.src = deleteIcon;


function deleteObject(_eventData : fabric.TPointerEvent, transform: fabric.Transform) {
  if(!transform.target) return;
  const canvas = transform.target.canvas;
  canvas?.remove(transform.target);
  canvas?.requestRenderAll();
}

function renderIcon(ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, fabricObject: fabric.Object) {
  const size = fabricObject.cornerSize;
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle));
  ctx.drawImage(deleteImg, -size / 2, -size / 2, size, size);
  ctx.restore();
}

export const useShape = (canvas: fabric.Canvas | null) => {
  
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
  const [fillShape, setFillShape] = useState<boolean>(true);
  const [shapeProps, setShapeProps] = useState<ShapeProperties>({
    fill: new fabric.Gradient({
      type: "linear",  // matches Gradient<'linear'>
      gradientUnits: "pixels", // or "percentage"
      coords: { x1: 0, y1: 0, x2: 0, y2: 200 },
      colorStops: [
        { offset: 0, color: "red" },
        { offset: 1, color: "blue" }
      ]
    }),
    strokeWidth: 2,
  });

  
  const createSelectedShape = (selectedShapeType: ShapeType) => {
      if (!canvas) return;
     

      setShapeType(selectedShapeType);

      const centerX = canvas.getWidth()! / 2;
      const centerY = canvas.getHeight()! / 2;

      let shape: fabric.Object;

      switch(selectedShapeType)
      {
        case 'rectangle':
          shape = new fabric.Rect({ 
            left: centerX - 50,
            top: centerY - 50,
            width: 100,
            height: 100,
            fill: shapeProps.fill, 
            strokeWidth: shapeProps.strokeWidth,
            originX: 'center',
            originY: 'center',
            selectable: true
            
            });
          break;
        case 'circle':
          shape = new fabric.Circle({ 
          left: centerX,
          top: centerY,
          radius: 50,
          fill: shapeProps.fill, 
          strokeWidth: shapeProps.strokeWidth,
          originX: 'center',
          originY: 'center',
          selectable: true
        });
          break;
        case 'ellipse':
          shape = new fabric.Ellipse({ 
          left: centerX,
          top: centerY,
          rx: 50, 
          ry: 30,
          fill: shapeProps.fill, 
          strokeWidth: shapeProps.strokeWidth,
          originX: 'center',
          originY: 'center',
          selectable: true
        });
        break;
        case 'line':
          shape = new fabric.Line([
            centerX - 100, centerY,  // start point
            centerX + 100, centerY   // end point
            ], {
            stroke: 'black',
            strokeWidth: 2,
            strokeDashArray: [5, 2],
            originX: 'center',
            originY: 'center',
            selectable: true
          });
          break;
        case 'triangle':
          shape = new fabric.Triangle({ 
            left: centerX,
            top: centerY,
            width: 100, 
            height: 100,
            fill: shapeProps.fill, 
            strokeWidth: shapeProps.strokeWidth,
            originX: 'center',
            originY: 'center',
             selectable: true
          });
          break;
        case 'polygon':
              // Create polygon points relative to center
          const points = [
            { x: -50, y: -50 },  // top left
            { x: 0, y: 50 },     // bottom middle
            { x: 50, y: -50 }    // top right
          ];

          // Translate points to center position
          const centeredPoints = points.map(p => ({
            x: p.x + centerX,
            y: p.y + centerY
          }));
        
          shape = new fabric.Polygon(centeredPoints, { 
            fill: shapeProps.fill, 
            strokeWidth: shapeProps.strokeWidth,
            originX: 'center',
            originY: 'center',
            selectable: true
          });
          break;
        default:
          return;
      }
      shape.controls.deleteControl = new fabric.Control({
        x: 0.5,
        y: -0.5,
        offsetY: 16,
        cursorStyle: 'pointer',
        mouseUpHandler: deleteObject,
       render: renderIcon,
      });
      canvas.add(shape);
      canvas.setActiveObject(shape);
      canvas.renderAll();
    };
  
  const activateShapeTool = () => {
    if (!canvas) return;
    canvas.isDrawingMode = false;
    canvas.renderAll();
  }

  const deactivateShapeTool = () => {
    if (!canvas) return;
    canvas.isDrawingMode = true;
    canvas.renderAll();
  }

  return {
    shapeType,
    setShapeType,
    shapeProps,
    setShapeProps,
    createSelectedShape,
    fillShape,
    setFillShape,
    deactivateShapeTool,
    activateShapeTool
  };
};