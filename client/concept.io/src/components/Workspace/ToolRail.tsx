import { useState } from 'react';
import { useTool } from '../../contexts/ToolContext';
import type { Tool, ToolType } from '../../types/tools';
import type { useBrush } from '../../hooks/Brush';
import { Pencil } from 'lucide-react';
import { BrushEditor } from './BrushEditor';
import { ColorPalette } from './ColorPalette';
import { SelectToolPanel, type SelectionMode } from './SelectToolPanel';
import type { RGBAColor } from '../../hooks/Color';

interface ToolRailProps {
  brushSize: number;
  brushOpacity: number;
  brushColor?: RGBAColor;
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onColorChange?: (color: RGBAColor) => void;
  brushProps?: ReturnType<typeof useBrush>;
  // Selection tool props
  selectionMode?: SelectionMode;
  onSelectionModeChange?: (mode: SelectionMode) => void;
  magicThreshold?: number;
  onMagicThresholdChange?: (threshold: number) => void;
}

interface ToolRailItem {
  id: ToolType;
  icon: string;
  label: string;
  hasSubmenu?: boolean;
  submenuType?: 'shape' | 'text' | 'brush' | 'select';
}

const railTools: ToolRailItem[] = [
  { id: 'select', icon: 'highlight_alt', label: 'Select', hasSubmenu: true, submenuType: 'select' },
  { id: 'brush', icon: 'brush', label: 'Brush', hasSubmenu: true, submenuType: 'brush' },
  { id: 'eraser', icon: 'auto_fix_normal', label: 'Eraser' },
  { id: 'generate', icon: 'auto_fix_high', label: 'Diffusion Cutout' },
  { id: 'Eyedropper', icon: 'colorize', label: 'Eyedropper' },
  { id: 'asset', icon: 'layers', label: 'Layers' },
];

export const ToolRail = ({
  brushSize,
  brushOpacity,
  brushColor = { r: 0, g: 0, b: 0, a: 1 },
  onBrushSizeChange,
  onBrushOpacityChange,
  onColorChange,
  brushProps,
  selectionMode = 'box',
  onSelectionModeChange,
  magicThreshold = 30,
  onMagicThresholdChange,
}: ToolRailProps) => {
  const { state, dispatch } = useTool();
  const [showBrushEditor, setShowBrushEditor] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSelectPanel, setShowSelectPanel] = useState(false);

  const handleToolClick = (tool: ToolRailItem) => {
    const toolPayload: Tool = {
      id: tool.id,
      label: tool.label,
      icon: Pencil,
      hasSubmenu: tool.hasSubmenu || false,
      submenuType: tool.submenuType,
    };
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: toolPayload });
    
    // Toggle panels based on tool
    if (tool.id === 'brush') {
      setShowBrushEditor(!showBrushEditor);
      setShowColorPicker(false);
      setShowSelectPanel(false);
    } else if (tool.id === 'select') {
      setShowSelectPanel(!showSelectPanel);
      setShowBrushEditor(false);
      setShowColorPicker(false);
    } else {
      setShowBrushEditor(false);
      setShowSelectPanel(false);
    }
  };

  const handleColorPickerToggle = () => {
    setShowColorPicker(!showColorPicker);
    setShowBrushEditor(false);
    setShowSelectPanel(false);
  };

  return (
    <aside className="absolute left-6 top-1/2 -translate-y-1/2 w-14 flex flex-col gap-4 z-20">
      {/* Tool Buttons */}
      <div className="glass-panel py-4 rounded-full flex flex-col items-center gap-5 thin-border shadow-xl">
        {railTools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool)}
            className={`transition-colors relative ${
              state.activeToolId === tool.id
                ? 'text-primary'
                : 'text-white/40 hover:text-white'
            }`}
            title={tool.label}
          >
            <span className="material-icons-round text-2xl">{tool.icon}</span>
          </button>
        ))}
        
        {/* Color Palette Button */}
        <button
          onClick={handleColorPickerToggle}
          className={`transition-colors relative ${showColorPicker ? 'ring-2 ring-primary ring-offset-2 ring-offset-transparent' : ''}`}
          title="Color Palette"
        >
          <div 
            className="w-6 h-6 rounded-full border-2 border-white/30 shadow-inner"
            style={{ 
              backgroundColor: `rgba(${brushColor.r}, ${brushColor.g}, ${brushColor.b}, ${brushColor.a})` 
            }}
          />
        </button>
      </div>

      {/* Brush Editor Panel */}
      {showBrushEditor && brushProps && (
        <BrushEditor
          brushProps={brushProps}
          onClose={() => setShowBrushEditor(false)}
        />
      )}

      {/* Advanced Color Palette */}
      {showColorPicker && onColorChange && (
        <ColorPalette
          currentColor={brushColor}
          onColorChange={onColorChange}
          onClose={() => setShowColorPicker(false)}
        />
      )}

      {/* Select Tool Panel */}
      {showSelectPanel && (
        <SelectToolPanel
          activeMode={selectionMode}
          onModeChange={(mode) => onSelectionModeChange?.(mode)}
          magicThreshold={magicThreshold}
          onThresholdChange={(threshold) => onMagicThresholdChange?.(threshold)}
          onClose={() => setShowSelectPanel(false)}
        />
      )}

      {/* Size & Opacity Sliders */}
      <div className="glass-panel px-3 py-4 rounded-2xl flex flex-col items-center gap-3 thin-border">
        {/* Size Slider */}
        <div className="flex flex-col items-center gap-2 w-full">
          <span className="text-[9px] font-bold text-white/50 uppercase tracking-wide">Size</span>
          <div className="relative w-8 h-20">
            {/* Background track */}
            <div className="absolute left-1/2 -translate-x-1/2 w-2 h-full bg-white/10 rounded-full overflow-hidden pointer-events-none">
              <div
                className="absolute bottom-0 w-full bg-primary/60 rounded-full transition-all"
                style={{ height: `${Math.min(100, (brushSize / 100) * 100)}%` }}
              />
            </div>
            {/* Vertical range input */}
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="absolute left-1/2 -translate-x-1/2 h-full w-20 cursor-pointer"
              style={{ 
                WebkitAppearance: 'slider-vertical',
                writingMode: 'vertical-lr',
                direction: 'rtl'
              }}
            />
          </div>
          <span className="text-[10px] text-white/40">{brushSize}px</span>
        </div>

        <div className="w-full h-px bg-white/10" />

        {/* Opacity Slider */}
        <div className="flex flex-col items-center gap-2 w-full">
          <span className="text-[9px] font-bold text-white/50 uppercase tracking-wide">Opacity</span>
          <div className="relative w-8 h-20">
            {/* Background track */}
            <div className="absolute left-1/2 -translate-x-1/2 w-2 h-full bg-white/10 rounded-full overflow-hidden pointer-events-none">
              <div
                className="absolute bottom-0 w-full bg-white/40 rounded-full transition-all"
                style={{ height: `${brushOpacity * 100}%` }}
              />
            </div>
            {/* Vertical range input */}
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={brushOpacity * 100}
              onChange={(e) => onBrushOpacityChange(Number(e.target.value) / 100)}
              className="absolute left-1/2 -translate-x-1/2 h-full w-20 cursor-pointer"
              style={{ 
                WebkitAppearance: 'slider-vertical',
                writingMode: 'vertical-lr',
                direction: 'rtl'
              }}
            />
          </div>
          <span className="text-[10px] text-white/40">{Math.round(brushOpacity * 100)}%</span>
        </div>
      </div>
    </aside>
  );
};
