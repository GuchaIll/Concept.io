



import type { LucideIcon } from 'lucide-react';

export type ToolType = 'brush' | 'shape' | 'text' | 'pan' | 'zoom' | 'eraser' | 'rotate' | 'mirror';

export interface Tool {
  id: ToolType;
  icon: LucideIcon;
  label: string;
  hasSubmenu?: boolean;
  submenuType?: 'shape' | 'text' | 'brush';
}

export interface ToolState {
  activeToolId: ToolType | null;
  activeTool: Tool | null;
}