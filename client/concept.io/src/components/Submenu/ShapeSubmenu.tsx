import { 
  Square, 
  Circle as CircleIcon, 
  Triangle,
  Minus,
  type LucideIcon
} from 'lucide-react';
import type { ShapeType } from '../../hooks/Shape';
import { useShape } from '../../hooks/Shape';
import { useCanvasContext } from '../../contexts/CanvasContext';

import { memo } from 'react';

const shapeIcons: Record<ShapeType, LucideIcon> = {
  rectangle: Square,
  circle: CircleIcon,
  triangle: Triangle,
  line: Minus,
  ellipse: CircleIcon,
  polygon: Triangle
};

export const ShapeSubmenu = memo(() => {
  const {canvas} = useCanvasContext();
  const { 
    shapeType, 
    shapeProps,
    setShapeProps,
    fillShape, 
    setFillShape, 
    createSelectedShape,
    
  } = useShape(canvas);

  const shapeData = Object.entries(shapeIcons).map(([type, Icon]) => ({
    type: type as ShapeType,
    icon: <Icon size={20} />
  }));

  return (
    <div className="absolute left-[200%] min-w-[220px] ml-2 top-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-3 space-y-4 dark:bg-gray-800">
      <div className="grid grid-cols-3 gap-8">

        {shapeData.map((shape) => (
          <button
            key={shape.type}
            onClick={() => { createSelectedShape(shape.type);}}
            className={`w-10 h-10 flex items-center justify-center rounded ${shapeType === shape.type ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
          >
            {shape.icon}
          </button>
        ))}
        
        {/* Add other shape buttons */}
      </div>
      <div className="space-y-2 mb-0">
        <label className="flex items-center gap-6">
          <input //TODO: display fill color for the shape
            type="checkbox"
            checked={fillShape}
            onChange={(e) => setFillShape(e.target.checked)}
          />
          <span className="text-sm">Fill Shape</span>
        </label>
        <div className = "mt-0">
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
});

ShapeSubmenu.displayName = 'ShapeSubmenu';