import { memo } from 'react';
import { useTool } from '../../contexts/ToolContext';
import { ToolButton } from '../Buttons/ToolButton';
import { tools } from '../../config/tools';
import { ShapeSubmenu } from '../Submenu/ShapeSubmenu';
import { TextSubmenu } from '../Submenu/TextSubmenu';
import {BrushSubmenu} from '../Submenu/BrushSubmenu';
import { ColorPicker } from '../Controls/Selector/ColorPicker';
import { useBrush } from '../../hooks/Brush';

export const ToolBar = memo((brushProps : ReturnType<typeof useBrush>) => {
  const { state } = useTool();

  return (
    <div className="fixed left-4 top-20 bg-white rounded-lg shadow-lg p-3 space-y-4 dark:bg-gray-800 z-50">
      <ColorPicker color={brushProps.color} onColorChange={brushProps.setColor} />
      <div className="grid grid-cols-2 gap-2">
         
        {tools.map((tool) => (
          <div key={tool.id} className="relative">
            <ToolButton
              tool={tool}
              isActive={state.activeToolId === tool.id}
            />
            {tool.hasSubmenu && state.activeToolId === tool.id && (
              <>
                {tool.submenuType === 'shape' && <ShapeSubmenu />}
                {tool.submenuType === 'text' && <TextSubmenu />}
                {tool.submenuType === 'brush' && <BrushSubmenu />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

ToolBar.displayName = 'ToolBar';