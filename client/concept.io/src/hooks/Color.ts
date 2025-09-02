import React from 'react'

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRGBA(hex: string, alpha: number = 1): RGBAColor{
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: alpha };
  };

export function ColorToString(RGBA: RGBAColor): string {
    const { r, g, b, a } = RGBA;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function hslToHex(h: number, s: number, l: number): string {
    // Normalize saturation and lightness
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s; // chroma
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
  }

  // Convert to [0,255] and adjust with `m`
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  // Format to hex string
  return `#${[r, g, b]
    .map(val => val.toString(16).padStart(2, "0"))
    .join("")}`;
  }