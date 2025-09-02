import { useEffect, useState } from 'react';
import * as fabric from 'fabric';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextProperties {
  fontSize: number;
  fontFamily: string;
  align: TextAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export const useText = (canvas: fabric.Canvas | null) => {
  const [textProps, setTextProps] = useState<TextProperties>({
    fontSize: 16,
    fontFamily: 'Arial',
    align: 'left',
    bold: false,
    italic: false,
    underline: false,
  });

  useEffect(() => {
    if (!canvas) return;

    const handleObjectSelected = (e: any) => {
      if (!e.target || e.target.type !== 'text') return;

      const { fontSize, fontFamily, textAlign, fontWeight, fontStyle, textDecoration } = e.target;
      setTextProps({ fontSize, fontFamily, align: textAlign, bold: fontWeight === 'bold', italic: fontStyle === 'italic', underline: textDecoration === 'underline' });
    };

    canvas.on('selection:created', handleObjectSelected);

    return () => canvas.off('selection:created', handleObjectSelected);
  }, [canvas]);

  return {
    textProps,
    setTextProps,
  };
};
