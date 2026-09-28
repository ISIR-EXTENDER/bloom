/** Colour maths for the palette checks: WCAG 2.x contrast, alpha compositing, hue and colour-vision simulation. */

export type Rgba = { alpha: number; blue: number; green: number; red: number };

export function parseColor(color: string): Rgba {
  const value = color.trim().toLowerCase();
  if (value.startsWith("#")) {
    const raw = value.slice(1);
    const hex = raw.length === 3 || raw.length === 4 ? [...raw].map((digit) => digit + digit).join("") : raw;
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
      throw new Error(`Invalid hex colour "${color}".`);
    }
    const channel = (offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
    return { red: channel(0), green: channel(2), blue: channel(4), alpha: hex.length === 8 ? channel(6) / 255 : 1 };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match?.[1]) {
    throw new Error(`Unsupported colour "${color}"; palette tokens are hex or rgb(a).`);
  }
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) {
    throw new Error(`Invalid rgb colour "${color}".`);
  }
  const [red, green, blue] = parts.slice(0, 3).map(Number) as [number, number, number];
  const alphaPart = parts[3];
  const alpha =
    alphaPart === undefined ? 1 : alphaPart.endsWith("%") ? Number.parseFloat(alphaPart) / 100 : Number(alphaPart);
  return { red, green, blue, alpha };
}

/** A translucent colour as it reads over an opaque one. */
export function composite(foreground: string, background: string): Rgba {
  const top = parseColor(foreground);
  const base = parseColor(background);
  if (base.alpha < 1) {
    throw new Error(`Cannot composite over translucent "${background}".`);
  }
  const mix = (over: number, under: number) => over * top.alpha + under * (1 - top.alpha);
  return { red: mix(top.red, base.red), green: mix(top.green, base.green), blue: mix(top.blue, base.blue), alpha: 1 };
}

function toLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  return 255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055);
}

function opaque(color: string | Rgba, background?: string): Rgba {
  const parsed = typeof color === "string" ? parseColor(color) : color;
  if (parsed.alpha >= 1) {
    return parsed;
  }
  if (!background || typeof color !== "string") {
    throw new Error("A translucent colour needs the surface it sits on.");
  }
  return composite(color, background);
}

export function relativeLuminance(color: string | Rgba): number {
  const { red, green, blue } = opaque(color);
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
}

/** WCAG contrast ratio; a translucent foreground is first composited over the background. */
export function contrastRatio(background: string, foreground: string): number {
  const back = relativeLuminance(opaque(background));
  const front = relativeLuminance(opaque(foreground, background));
  return (Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05);
}

/** Hue in degrees; green sits near 120, cyan near 190. */
export function hueOf(color: string): number {
  const { red, green, blue } = opaque(color);
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const highest = Math.max(r, g, b);
  const delta = highest - Math.min(r, g, b);
  if (delta === 0) {
    return 0;
  }
  const sector = highest === r ? ((g - b) / delta) % 6 : highest === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

export function hueDistance(first: string, second: string): number {
  const distance = Math.abs(hueOf(first) - hueOf(second));
  return Math.min(distance, 360 - distance);
}

export type ColorVisionDeficiency = "deuteranopia" | "protanopia";

// Machado, Oliveira and Fernandes (2009), severity 1, applied in linear RGB.
const CVD_MATRICES: Record<ColorVisionDeficiency, readonly (readonly [number, number, number])[]> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

export function simulateColorVision(color: string, deficiency: ColorVisionDeficiency): Rgba {
  const { red, green, blue } = opaque(color);
  const linear = [toLinear(red), toLinear(green), toLinear(blue)];
  const [r, g, b] = CVD_MATRICES[deficiency].map(
    ([x, y, z]) => x * (linear[0] ?? 0) + y * (linear[1] ?? 0) + z * (linear[2] ?? 0),
  ) as [number, number, number];
  return { red: fromLinear(r), green: fromLinear(g), blue: fromLinear(b), alpha: 1 };
}

function toLab(color: Rgba): [number, number, number] {
  const [r, g, b] = [toLinear(color.red), toLinear(color.green), toLinear(color.blue)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour difference; about 2 is barely noticeable, above 20 reads as a different colour. */
export function colorDifference(first: string | Rgba, second: string | Rgba): number {
  const [l1, a1, b1] = toLab(opaque(first));
  const [l2, a2, b2] = toLab(opaque(second));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
