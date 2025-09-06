import { 
  Square, 
  Circle as CircleIcon, 
  Triangle,
  Hexagon,
  Minus,
  
} from 'lucide-react';
import type {ShapeType, ShapeProperties} from '../../hooks/Shape'

import React from 'react'

export const ShapeSubmenu: React.FC<{
  shapeType: ShapeType;
  setShapeType: (type: ShapeType) => void;
  shapeProps: ShapeProperties;
  setShapeProps: (props: ShapeProperties) => void;
  fillShape: boolean;
  setFillShape: (fill: boolean) => void;
  createSelectedShape: (selectedShapeType: ShapeType) => void;

}> = ({ shapeType, setShapeType, shapeProps, setShapeProps, fillShape, setFillShape, createSelectedShape }) => {

  const shapeData: { type: ShapeType; icon: React.ReactNode }[] = [
    { type: 'rectangle', icon: <Square size={20} /> },
    { type: 'circle', icon: <CircleIcon size={20} /> },
    { type: 'triangle', icon: <Triangle size={20} /> },
    { type: 'line', icon: <Minus size={20} /> },
  ];

  return (
    <div className="absolute left-full ml-2 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800">
      <div className="grid grid-cols-2 gap-2">
        {shapeData.map((shape) => (
          <button
            key={shape.type}
            onClick={() => { createSelectedShape(shape.type);}}
            className={`p-2 rounded ${shapeType === shape.type ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            {shape.icon}
          </button>
        ))}
        
        {/* Add other shape buttons */}
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input //TODO: display fill color for the shape
            type="checkbox"
            checked={fillShape}
            onChange={(e) => setFillShape(e.target.checked)}
          />
          <span className="text-sm">Fill Shape</span>
        </label>
        <div>
          <label className="text-sm">Stroke Width</label>
          <input
            type="range"
            min="1"
            max="20"
            value={shapeProps.strokeWidth}
            onChange={(e) => setShapeProps({ ...shapeProps, strokeWidth: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};