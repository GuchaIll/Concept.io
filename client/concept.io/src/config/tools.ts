import type { Tool } from '../types/tools';
import { 
   Square,
   Type,
   Pencil,
   Eraser,
   Move, ZoomIn, RotateCw, ToggleLeft, Pipette, PaintBucket

} from 'lucide-react';

export const tools: Tool[] = [
  {
    id: 'Eyedropper',
    label: 'Eyedropper',
    icon: Pipette,
    hasSubmenu: false,
  },
  {
    id: 'Fill',
    label: 'Fill',
    icon: PaintBucket,
    hasSubmenu: false,
  },
  {
    id: 'brush',
    label: 'Brush',
    icon: Pencil,
    hasSubmenu: true,
    submenuType: 'brush',
  },
  {
    id: 'eraser',
    label: 'Eraser',
    icon: Eraser,
    hasSubmenu: false,
  },
  {
    id: 'shape',
    label: 'Shape',
    icon: Square,
    hasSubmenu: true,
    submenuType: 'shape',
  },
  {
    id: 'text',
    label: 'Text',
    icon: Type,
    hasSubmenu: true,
    submenuType: 'text',
  },
  {
    id: 'zoom',
    label: 'Zoom',
    icon: ZoomIn,
    hasSubmenu: false,
    
  },
  {
    id: 'pan',
    label: 'Pan',
    icon: Move,
    hasSubmenu: false,
  },
  {
    id: 'rotate',
    label: 'Rotate',
    icon: RotateCw,
    hasSubmenu: false,

  },
  {
    id: 'mirror',
    label: 'Mirror',
    icon: ToggleLeft,
    hasSubmenu: false,
  },

];
