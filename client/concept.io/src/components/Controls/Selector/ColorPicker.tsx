import { HslColorPicker } from 'react-colorful';
import type { HslColor } from 'react-colorful';
import React from 'react'
import {hslToHex, ColorToString, hexToRGBA} from '../../../hooks/Color'
import type { RGBAColor } from '../../../hooks/Color';

interface ColorPickerProps {
  color: RGBAColor;
  onColorChange: (color: RGBAColor) => void;
}
export const ColorPicker = ({ color, onColorChange }: ColorPickerProps) => {
  const [currentColor, setCurrentColor] = React.useState<HslColor>({ h: 0, s: 0, l: 0});

  React.useEffect(() => {
    const hexColor = hslToHex(currentColor.h, currentColor.s, currentColor.l);
    const rgbaColor = hexToRGBA(hexColor, color.a);
    onColorChange(rgbaColor);
  }, [currentColor]);

  return (
    <HslColorPicker color={currentColor} onChange={setCurrentColor} className = "z-50"/>
  )
}




