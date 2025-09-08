import { memo } from 'react';
import type { Tool } from '../../types/tools';
import { useTool } from '../../contexts/ToolContext';

interface ToolButtonProps {
  tool: Tool;
  isActive: boolean;
}

export const ToolButton = memo(({ tool, isActive }: ToolButtonProps) => {
  const { dispatch } = useTool();

  const handleClick = () => {
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
  };

  return (
    <button
      onClick={handleClick}
      className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors
        ${isActive 
          ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300' 
          : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
        }`}
      title={tool.label}
    >
      {tool.icon}
      <span className="text-xs">{tool.label}</span>
    </button>
  );
});

ToolButton.displayName = 'ToolButton';