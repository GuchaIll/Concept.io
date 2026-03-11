/**
 * Layer Constraint Configuration
 * Declarative rules defining which tools are allowed on each layer type.
 */

// LayerType is used in the type annotations for LAYER_CONSTRAINTS
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LayerType as _LayerType } from '../hooks/Layer';

export type ToolId = 'brush' | 'eraser' | 'select' | 'pan' | 'zoom' | 'text' |
  'shape' | 'Fill' | 'Eyedropper' | 'rotate' | 'mirror' | 'generate' | 'asset';

export interface LayerConstraint {
  allowedTools: ToolId[];
  blockedToolMessage: Record<string, string>;
  allowDrawing: boolean;
  allowObjectManipulation: boolean;
  description: string;
}

/**
 * Constraint map: LayerType → constraint rules.
 * - `paint`: Full drawing/editing capabilities
 * - `asset`: Import/manipulate assets only, no freehand drawing
 * - `backgroundPlate`: Compositing only, no drawing
 * - `lightingOverlay`: Lighting adjustments only, no drawing
 * - `diffusionRegion`: AI generation region, no drawing
 */
export const LAYER_CONSTRAINTS: Record<string, LayerConstraint> = {
  paint: {
    allowedTools: ['brush', 'eraser', 'select', 'pan', 'zoom', 'text', 'shape', 'Fill', 'Eyedropper', 'rotate', 'mirror', 'generate', 'asset'],
    blockedToolMessage: {},
    allowDrawing: true,
    allowObjectManipulation: true,
    description: 'Paint layer — full drawing and editing tools available.',
  },
  asset: {
    allowedTools: ['select', 'pan', 'zoom', 'Eyedropper', 'rotate', 'mirror', 'asset'],
    blockedToolMessage: {
      brush: 'Brush tool is not available on Asset layers — switch to a Paint layer.',
      eraser: 'Eraser is not available on Asset layers — switch to a Paint layer.',
      text: 'Text tool is not available on Asset layers.',
      shape: 'Shape tool is not available on Asset layers.',
      Fill: 'Fill tool is not available on Asset layers.',
    },
    allowDrawing: false,
    allowObjectManipulation: true,
    description: 'Asset layer — import and manipulate assets only.',
  },
  backgroundPlate: {
    allowedTools: ['select', 'pan', 'zoom', 'Eyedropper'],
    blockedToolMessage: {
      brush: 'Brush tool is not available on Background Plate layers.',
      eraser: 'Eraser is not available on Background Plate layers.',
      text: 'Text tool is not available on Background Plate layers.',
      shape: 'Shape tool is not available on Background Plate layers.',
      Fill: 'Fill tool is not available on Background Plate layers.',
      asset: 'Asset placement is not available on Background Plate layers.',
    },
    allowDrawing: false,
    allowObjectManipulation: false,
    description: 'Background Plate — compositing layer, no direct editing.',
  },
  lightingOverlay: {
    allowedTools: ['select', 'pan', 'zoom', 'Eyedropper'],
    blockedToolMessage: {
      brush: 'Brush tool is not available on Lighting Overlay layers.',
      eraser: 'Eraser is not available on Lighting Overlay layers.',
      text: 'Text tool is not available on Lighting Overlay layers.',
      shape: 'Shape tool is not available on Lighting Overlay layers.',
      Fill: 'Fill tool is not available on Lighting Overlay layers.',
      asset: 'Asset placement is not available on Lighting Overlay layers.',
    },
    allowDrawing: false,
    allowObjectManipulation: false,
    description: 'Lighting Overlay — lighting adjustments only.',
  },
  diffusionRegion: {
    allowedTools: ['select', 'pan', 'zoom', 'Eyedropper', 'generate'],
    blockedToolMessage: {
      brush: 'Brush tool is not available on Diffusion Region layers — use Generate instead.',
      eraser: 'Eraser is not available on Diffusion Region layers.',
      text: 'Text tool is not available on Diffusion Region layers.',
      shape: 'Shape tool is not available on Diffusion Region layers.',
      Fill: 'Fill tool is not available on Diffusion Region layers.',
    },
    allowDrawing: false,
    allowObjectManipulation: true,
    description: 'Diffusion Region — AI generation area.',
  },
};

/**
 * Get constraints for a given layer type.
 * Falls back to paint constraints for undefined/unknown types.
 */
export function getLayerConstraints(layerType?: string): LayerConstraint {
  if (!layerType || !(layerType in LAYER_CONSTRAINTS)) {
    return LAYER_CONSTRAINTS.paint;
  }
  return LAYER_CONSTRAINTS[layerType];
}

/**
 * Check if a tool is allowed on a given layer type.
 */
export function isToolAllowed(toolId: string, layerType?: string, isLocked?: boolean): boolean {
  if (isLocked) return false;
  const constraints = getLayerConstraints(layerType);
  return constraints.allowedTools.includes(toolId as ToolId);
}

/**
 * Get a warning message when a tool is blocked on a layer.
 * Returns null if the tool is allowed.
 */
export function getBlockedToolMessage(toolId: string, layerType?: string, isLocked?: boolean): string | null {
  if (isLocked) {
    return 'This layer is locked — unlock it to use tools.';
  }
  const constraints = getLayerConstraints(layerType);
  if (constraints.allowedTools.includes(toolId as ToolId)) {
    return null;
  }
  return constraints.blockedToolMessage[toolId] || `${toolId} is not available on this layer type.`;
}
