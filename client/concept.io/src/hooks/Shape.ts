import { useEffect, useState } from 'react';
import * as fabric from 'fabric';

export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 
                    'line' | 'triangle' | 'polygon';

export interface ShapeProperties {
  fill: boolean;
  strokeWidth: number;
}

export const useShape = (canvas: fabric.Canvas | null) => {
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
  const [shapeProps, setShapeProps] = useState<ShapeProperties>({
    fill: true,
    strokeWidth: 1,
  });

  useEffect(() => {
    if (!canvas) return;

    const handleObjectSelected = (e: any) => {
      if (!e.target || e.target.type === 'path' || e.target.type === 'text') return;

      const { type, fill, strokeWidth } = e.target;
      setShapeType(type);
      setShapeProps({ fill, strokeWidth });
    };

    canvas.on('selection:created', handleObjectSelected);

    return () => canvas.off('selection:created', handleObjectSelected);
  }, [canvas]);

  return {
    shapeType,
    setShapeType,
    shapeProps,
    setShapeProps,
  };
};