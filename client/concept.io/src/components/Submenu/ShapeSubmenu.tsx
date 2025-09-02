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
}> = ({ shapeType, setShapeType, shapeProps, setShapeProps }) => {
  return (
    <div className="absolute left-full ml-2 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShapeType('rectangle')}
          className={`p-2 rounded ${shapeType === 'rectangle' ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
        >
          <Square size={20} />
        </button>
        <button
          onClick={() => setShapeType('circle')}
          className={`p-2 rounded ${shapeType === 'circle' ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
        >
          <CircleIcon size={20} />
        </button>
        {/* Add other shape buttons */}
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shapeProps.fill}
            onChange={(e) => setShapeProps({ ...shapeProps, fill: e.target.checked })}
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