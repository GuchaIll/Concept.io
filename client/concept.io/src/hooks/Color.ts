/**
 * Color utilities for working with different color formats
 */

export interface RGBAColor {
  r: number; // Red (0-255)
  g: number; // Green (0-255)
  b: number; // Blue (0-255)
  a: number; // Alpha (0-1)
}

/**
 * Converts a hex color string to RGBA color object
 * @param hex - Hex color string (e.g. "#FF5500")
 * @param alpha - Alpha value (0-1)
 * @returns RGBA color object
 */
export function hexToRGBA(hex: string, alpha: number = 1): RGBAColor {
  // Ensure proper hex format
  const normalizedHex = hex.charAt(0) === '#' ? hex : `#${hex}`;

  try {
    const r = parseInt(normalizedHex.slice(1, 3), 16);
    const g = parseInt(normalizedHex.slice(3, 5), 16);
    const b = parseInt(normalizedHex.slice(5, 7), 16);

    // Check for valid values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      throw new Error(`Invalid hex color: ${hex}`);
    }

    return { r, g, b, a: Math.max(0, Math.min(1, alpha)) };
  } catch (error) {
    console.warn(`Error parsing hex color ${hex}:`, error);
    return { r: 0, g: 0, b: 0, a: alpha };
  }
}

/**
 * Converts an RGBA color object to a CSS color string
 * @param rgba - RGBA color object
 * @returns CSS rgba string
 */
export function rgbaToString(rgba: RGBAColor): string {
  const { r, g, b, a } = rgba;
  const validR = Math.max(0, Math.min(255, Math.round(r)));
  const validG = Math.max(0, Math.min(255, Math.round(g)));
  const validB = Math.max(0, Math.min(255, Math.round(b)));
  const validA = Math.max(0, Math.min(1, a));

  return `rgba(${validR}, ${validG}, ${validB}, ${validA})`;
}

/**
 * Legacy function for compatibility - Converts RGBA to string
 * @deprecated Use rgbaToString instead
 */
export function ColorToString(rgba: RGBAColor): string {
  return rgbaToString(rgba);
}

/**
 * Converts HSL color values to a hex color string
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color string
 */
export function hslToHex(h: number, s: number, l: number): string {
  // Normalize values
  const hue = Math.max(0, Math.min(360, h));
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation; // chroma
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0, g = 0, b = 0;

  if (0 <= hue && hue < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= hue && hue < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= hue && hue < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= hue && hue < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= hue && hue < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= hue && hue < 360) {
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

/**
 * Converts a hex color string to HSL values
 * @param hex - Hex color string
 * @returns Object with h, s, l properties
 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const rgba = hexToRGBA(hex);
  const r = rgba.r / 255;
  const g = rgba.g / 255;
  const b = rgba.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else if (max === b) h = (r - g) / d + 4;

    h *= 60;
  }

  return { h, s: s * 100, l: l * 100 };
}