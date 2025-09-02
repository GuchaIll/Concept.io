import React from 'react';
import { 
  Pencil, 
  Eraser, 
  Circle, 
  Square, 
  SprayCan, 
  Minus, 
  GripHorizontal,
  Diamond,
  Image,
  Undo,
  Redo,
  Trash2,
  Pipette
} from 'lucide-react';
import {ColorToString, hexToRGBA} from '../../hooks/Color'
import type { RGBAColor } from '../../hooks/Color';

interface ToolBarProps {
  brushType: string;
  setBrushType: (type: string) => void;
  color: RGBAColor;
  setColor: (color: RGBAColor) => void;
  brushOpacity: number;
  setBrushOpacity: (opacity: number) => void;
  lineWidth: number;
  setLineWidth: (width: number) => void;
  eraseModeOn: boolean;
  handleErase: () => void;
  handleClearCanvas: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  drawingModeOn: boolean;
  handleToggleDrawing: () => void;
  isEyedropperActive: boolean;
  handleEyedropperTool: () => void;
}

const ToolBar: React.FC<ToolBarProps> = ({
  brushType,
  setBrushType,
  color,
  setColor,
  lineWidth,
  setLineWidth,
  brushOpacity,
  setBrushOpacity,
  eraseModeOn,
  handleErase,
  handleClearCanvas,
  handleUndo,
  handleRedo,
  drawingModeOn,
  handleToggleDrawing,
  isEyedropperActive,
  handleEyedropperTool,
}) => {
  const tools = [
    { id: 'Pencil', icon: <Pencil size={20} />, label: 'Pencil' },
    { id: 'Circle', icon: <Circle size={20} />, label: 'Circle Brush' },
    { id: 'Spray', icon: <SprayCan size={20} />, label: 'Spray' },
    { id: 'hline', icon: <GripHorizontal size={20} />, label: 'Horizontal Lines' },
    { id: 'vline', icon: <Minus size={20} />, label: 'Vertical Lines' },
    { id: 'square', icon: <Square size={20} />, label: 'Square Pattern' },
    { id: 'diamond', icon: <Diamond size={20} />, label: 'Diamond Pattern' },
    { id: 'texture', icon: <Image size={20} />, label: 'Texture Pattern' },
  ];

  return (
    <div className="fixed left-4 top-20 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800 z-50">
      {/* Drawing Tools */}
      <div className="grid grid-cols-2 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setBrushType(tool.id)}
            className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors
              ${brushType === tool.id 
                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' 
                : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
              }`}
            title={tool.label}
          >
            {tool.icon}
            <span className="text-xs">{tool.label}</span>
          </button>
        ))}
      </div>

      {/* Eraser and Clear */}
      <div className="flex gap-2">
        <button
          onClick={handleErase}
          className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-2 transition-colors
            ${eraseModeOn 
              ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' 
              : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
            }`}
          title="Eraser"
        >
          <Eraser size={20} />
        </button>
        <button
          onClick={handleClearCanvas}
          className="flex-1 p-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 text-gray-700 
                   dark:hover:bg-gray-700 dark:text-gray-300"
          title="Clear Canvas"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Brush Properties */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Color</label>
          <input
            type="color"
            value={ColorToString(color)}
            onChange={(e) => setColor(hexToRGBA(e.target.value))}
            className="w-8 h-8 rounded cursor-pointer"
          />
        </div>
        <button
        onClick={handleEyedropperTool}
        className={`p-2 rounded ${
          isEyedropperActive 
            ? 'bg-blue-500 text-white' 
            : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600'
        }`}
        title="Color Picker"
      >
        <Pipette className="w-6 h-6" />
      </button>
        <div className="space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Line Width</label>
          <input
            type="range"
            min="1"
            max="100"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-0">{lineWidth}px</div>
          <label className="text-sm text-gray-600 dark:text-gray-400 mt-0">Opacity</label>
          <input
            type="range"
            min="0"
            max="100"
            value={brushOpacity * 100}
            onChange={(e) => setBrushOpacity(parseInt(e.target.value)/100)}
            className="w-full accent-indigo-600"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">{Math.round(brushOpacity * 100)}%</div>
        </div>
        
      </div>

      {/* History Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleUndo}
          className="flex-1 p-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 
                   text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
          title="Undo"
        >
          <Undo size={20} />
        </button>
        <button
          onClick={handleRedo}
          className="flex-1 p-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 
                   text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
          title="Redo"
        >
          <Redo size={20} />
        </button>
      </div>

      {/* Drawing Mode Toggle */}
      <button
        onClick={handleToggleDrawing}
        className={`w-full p-2 rounded-lg flex items-center justify-center gap-2 transition-colors
          ${drawingModeOn 
            ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300' 
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}
      >
        {drawingModeOn ? 'Drawing Mode: ON' : 'Drawing Mode: OFF'}
      </button>
    </div>
  );
};

export default ToolBar;
