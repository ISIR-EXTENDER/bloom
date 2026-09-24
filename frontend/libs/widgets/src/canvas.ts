import type { CanvasPresetId, CanvasSettings, WidgetConfig } from "@bloom/api-client";

/** The canvas presets and how a screen fits a viewport. */
export type CanvasPreset = {
  id: CanvasPresetId;
  label: string;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

const CANVAS_WIDGET_EDGE_PADDING = 24;

const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: "native-1024x600", label: "Native Tablet (1024x600)", width: 1024, height: 600 },
  { id: "native-1280x720", label: "Native Operator Panel (1280x720)", width: 1280, height: 720 },
  { id: "hd", label: "HD (1280x720)", width: 1280, height: 720 },
  { id: "tablet", label: "Tablet (1280x800)", width: 1280, height: 800 },
  { id: "wide-tablet", label: "Wide Tablet Runtime (1820x720)", width: 1820, height: 720 },
  { id: "full-hd", label: "Full HD (1920x1080)", width: 1920, height: 1080 },
  { id: "local-screen", label: "Local Screen (1920x1080)", width: 1920, height: 1080 },
];

function getCanvasPreset(presetId: CanvasPresetId): CanvasPreset {
  return CANVAS_PRESETS.find((preset) => preset.id === presetId) ?? CANVAS_PRESETS[0];
}

export function resolveCanvasPresetSize(settings: CanvasSettings): ViewportSize {
  const preset = getCanvasPreset(settings.preset_id);
  return {
    width: preset.width,
    height: preset.height,
  };
}

export function resolveCanvasArtboardSize(widgets: readonly WidgetConfig[], settings: CanvasSettings): ViewportSize {
  const presetSize = resolveCanvasPresetSize(settings);
  const maxRight = widgets.reduce((right, widget) => Math.max(right, widget.layout.x + widget.layout.width), 0);
  const maxBottom = widgets.reduce((bottom, widget) => Math.max(bottom, widget.layout.y + widget.layout.height), 0);

  return {
    width: Math.max(presetSize.width, maxRight + CANVAS_WIDGET_EDGE_PADDING),
    height: Math.max(presetSize.height, maxBottom + CANVAS_WIDGET_EDGE_PADDING),
  };
}

export function resolveCanvasFitScale(
  settings: CanvasSettings,
  canvasSize: ViewportSize,
  viewportSize: ViewportSize,
): number {
  if (settings.runtime_mode !== "fit" && settings.runtime_mode !== "operator-fit") {
    return 1;
  }
  if (canvasSize.width <= 0 || canvasSize.height <= 0) {
    return 1;
  }
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return 1;
  }
  return Math.min(viewportSize.width / canvasSize.width, viewportSize.height / canvasSize.height);
}
