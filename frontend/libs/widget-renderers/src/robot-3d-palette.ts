import { Color } from "three";

/** The 3D view's colours, read from the theme's tokens so the stage follows the chosen palette. */
export type ScenePalette = { command: Color; grid: Color; gridCenter: Color; robot: Color };

export const DEFAULT_SCENE_PALETTE = {
  command: "#3b6fd1",
  grid: "#d9d4c7",
  gridCenter: "#b7b1a3",
  robot: "#7e967e",
  surface: "#fffaf1",
} as const;

type Rgb = [number, number, number];

/** Hex or rgb(a); a translucent token is flattened over the widget's surface, since three.js has no alpha here. */
export function parseSceneColor(value: string, over: Rgb = [255, 250, 241]): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as Rgb;
  }
  const parts = text
    .match(/^rgba?\(([^)]+)\)$/)?.[1]
    ?.split(/[\s,/]+/)
    .filter(Boolean);
  if (!parts || parts.length < 3) {
    return null;
  }
  const [red, green, blue] = parts.slice(0, 3).map(Number) as Rgb;
  const alpha = parts[3] === undefined ? 1 : Number(parts[3]);
  if (![red, green, blue, alpha].every(Number.isFinite)) {
    return null;
  }
  return [red, green, blue].map((channel, index) => channel * alpha + (over[index] ?? 0) * (1 - alpha)) as Rgb;
}

export function readScenePalette(element: Element | null): ScenePalette {
  const style = element && typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  const token = (name: string) => style?.getPropertyValue(name) ?? "";
  const surface =
    parseSceneColor(token("--bloom-color-surface-container-low")) ??
    (parseSceneColor(DEFAULT_SCENE_PALETTE.surface) as Rgb);
  const color = (name: string, fallback: string) => {
    const rgb = parseSceneColor(token(name), surface) ?? parseSceneColor(fallback);
    return new Color().setRGB(...((rgb ?? [0, 0, 0]).map((channel) => channel / 255) as Rgb), "srgb");
  };
  return {
    command: color("--bloom-color-command", DEFAULT_SCENE_PALETTE.command),
    grid: color("--bloom-color-hairline", DEFAULT_SCENE_PALETTE.grid),
    gridCenter: color("--bloom-color-hairline-strong", DEFAULT_SCENE_PALETTE.gridCenter),
    robot: color("--bloom-color-sage", DEFAULT_SCENE_PALETTE.robot),
  };
}

export function samePalette(first: ScenePalette, second: ScenePalette): boolean {
  return (["command", "grid", "gridCenter", "robot"] as const).every((key) => first[key].equals(second[key]));
}

/** Calls back when the nearest themed ancestor switches palette; returns the disconnect. */
export function watchThemeChange(element: Element, onChange: () => void): () => void {
  const themed = element.closest("[data-bloom-theme]");
  if (!themed || typeof MutationObserver === "undefined") {
    return () => undefined;
  }
  const observer = new MutationObserver(onChange);
  observer.observe(themed, { attributeFilter: ["data-bloom-theme"], attributes: true });
  return () => observer.disconnect();
}
