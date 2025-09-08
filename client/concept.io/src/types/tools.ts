export type ToolType = 'brush' | 'shape' | 'text' | 'pan' | 'zoom' | 'eraser';

export interface Tool {
  id: ToolType;
  icon: React.ReactNode;
  label: string;
  hasSubmenu?: boolean;
  submenuType?: 'shape' | 'text';
}

export interface ToolState {
  activeToolId: ToolType | null;
  activeTool: Tool | null;
}