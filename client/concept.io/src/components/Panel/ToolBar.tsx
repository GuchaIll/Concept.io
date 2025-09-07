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
  Pipette,
  Type,
  Move,
  ZoomIn,
  RotateCw,
  ToggleLeft
} from 'lucide-react';
import {ColorToString, hexToRGBA} from '../../hooks/Color'
import type { RGBAColor } from '../../hooks/Color';
import type {ShapeType, ShapeProperties } from '../../hooks/Shape'
import type {TextProperties} from '../../hooks/Text'
import { ShapeSubmenu } from '../Submenu/ShapeSubmenu';
import { TextSubmenu } from '../Submenu/TextSubmenu';

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
  shapeType: ShapeType;
  setShapeType: (type: ShapeType) => void;
  textProps: TextProperties;
  setTextProps: (props: TextProperties) => void;
  shapeProps: ShapeProperties;
  setShapeProps: (props: ShapeProperties) => void;
  fillShape: boolean;
  setFillShape: (fill: boolean) => void;
  createSelectedShape: (selectedShapeType: ShapeType) => void;
  activateTextTool: () => void;
  deactivateTextTool: () => void;  
  deactivateShapeTool: () => void;
  activateShapeTool: () => void; 
  isPanning: boolean;
  activatePanMode: () => void;
  deactivatePanMode: () => void;
  resetZoomPan: () => void;
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
  shapeType,
  setShapeType,
  textProps,
  setTextProps,
  shapeProps,
  setShapeProps,
  fillShape,
  setFillShape,
  createSelectedShape,
  activateTextTool,
  deactivateTextTool,
  deactivateShapeTool,
  activateShapeTool,
  isPanning,
  activatePanMode,
  deactivatePanMode,
  resetZoomPan,

}) => {
  const tools = [
    { id: 'Pencil', icon: <Pencil size={20} />, label: 'Pencil', hasSubmenu: false},
    { id: 'Circle', icon: <Circle size={20} />, label: 'Circle Brush', hasSubmenu: false },
    { id: 'Spray', icon: <SprayCan size={20} />, label: 'Spray', hasSubmenu: false },
    { id: 'hline', icon: <GripHorizontal size={20} />, label: 'Horizontal Lines', hasSubmenu: false },
    { id: 'vline', icon: <Minus size={20} />, label: 'Vertical Lines', hasSubmenu: false },
    { id: 'square', icon: <Square size={20} />, label: 'Square Pattern', hasSubmenu: false },
    { id: 'diamond', icon: <Diamond size={20} />, label: 'Diamond Pattern', hasSubmenu: false },
    { id: 'texture', icon: <Image size={20} />, label: 'Texture Pattern', hasSubmenu: false },
    { id: 'shape', icon: <Square size={20} />, label: 'Shapes', hasSubmenu: true },
    { id: 'text', icon: <Type size={20} />, label: 'Text', hasSubmenu: true },
    { 
      id: 'pan',
      icon: <Move size={20} />,
      label: 'Pan',
      onClick: () => {
        if (isPanning) {
          deactivatePanMode();
        } else {
          activatePanMode();
        }
      }
    },
    {
      id: 'reset-view',
      icon: <RotateCw size={20} />,
      label: 'Reset View',
      onClick: resetZoomPan
    }
  ];

  const [activeSubMenu, setActiveSubMenu] = React.useState<'none' | 'shape' | 'text'>('none');


   const handleToolClick = (tool: typeof tools[0]) => {
    setBrushType(tool.id);
    
    if (tool.hasSubmenu) {
      if (activeSubMenu === tool.id) {
        // Turning off the current submenu
         setActiveSubMenu('none');
        if (tool.id === 'text') {
           deactivateTextTool();
        }
        if(tool.id === 'shape'){
          deactivateShapeTool();
        }
      } else {
        // Switching to a new submenu
        if (activeSubMenu !== "none" && activeSubMenu === 'text') {
          deactivateTextTool();
        }
        if(activeSubMenu !== "none" && activeSubMenu === 'shape'){
          deactivateShapeTool();
        }
        setActiveSubMenu(tool.id as 'shape' | 'text');
        if (tool.id === 'text') {
          activateTextTool();
        }
        if(tool.id === 'shape'){
          activateShapeTool();
        }
      }
    } else {
      // Clicking a regular tool
      if (activeSubMenu === 'text') {
        deactivateTextTool();
      }
      if(activeSubMenu === 'shape'){
        deactivateShapeTool();
      }

      if(tool.id === 'pan')
      {
        tool.onClick && tool.onClick();
      }

      if(tool.id === 'reset-view'){
        tool.onClick && tool.onClick();
      }
      setActiveSubMenu('none');
    }
  };

  return (
    <div className="fixed left-4 top-20 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800 z-50">
      {/* Drawing Tools */}
      <div className="grid grid-cols-2 gap-2">
        {tools.map((tool) => (
          <div key={tool.id} className="relative">
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool)}
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

          {tool.id === 'shape' && activeSubMenu === 'shape' && (
      <ShapeSubmenu
        shapeType={shapeType}
        setShapeType={setShapeType}
        shapeProps={shapeProps}
        setShapeProps={setShapeProps}
        fillShape={fillShape}
        setFillShape={setFillShape}
        createSelectedShape={createSelectedShape}
      />
    )}
    
    {tool.id === 'text' && activeSubMenu === 'text' && (
      <TextSubmenu
        textProps={textProps}
        setTextProps={setTextProps}
        
      />
    )}
          </div>
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
       _{/* <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Color</label>
          <input
            type="color"
            value={ColorToString(color)}
            onChange={(e) => setColor(hexToRGBA(e.target.value))}
            className="w-8 h-8 rounded cursor-pointer"
          />
        </div> */}
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
