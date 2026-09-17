/**
 * Minimum size per widget kind at scale 1.0, derived from what each renderer draws (ADR 0132,
 * docs/design/widget-min-size.md). The builder inspector, the review checklist and the seed validator read this one table.
 */
export type WidgetMinSize = readonly [width: number, height: number];

export const WIDGET_MIN_SIZE: Readonly<Record<string, { off: WidgetMinSize; on: WidgetMinSize }>> = {
  joystick: { off: [280, 332], on: [320, 400] },
  "slider:vertical": { off: [104, 284], on: [130, 312] },
  "slider:horizontal": { off: [260, 104], on: [300, 132] },
  toggle: { off: [200, 120], on: [250, 144] },
  "command-button": { off: [140, 104], on: [170, 152] },
  // Under a group label the widget renders no title: button + padding.
  "command-button:grouped": { off: [140, 88], on: [140, 88] },
  "toggle:grouped": { off: [200, 88], on: [200, 88] },
  // Title and commanded state beside the button instead of above it.
  "toggle:inline": { off: [360, 88], on: [360, 88] },
  "topic-echo": { off: [226, 200], on: [280, 280] },
  "topic-plot": { off: [280, 180], on: [320, 240] },
  gauge: { off: [280, 180], on: [320, 240] },
  label: { off: [120, 24], on: [120, 24] },
  "position-library": { off: [420, 300], on: [480, 360] },
  "event-log": { off: [300, 200], on: [340, 240] },
  "plot-board": { off: [480, 280], on: [480, 280] },
  "plot-picker": { off: [260, 200], on: [260, 200] },
  "value-strip": { off: [440, 140], on: [440, 140] },
  "joint-table": { off: [480, 280], on: [480, 280] },
  jacobian: { off: [480, 360], on: [480, 360] },
};

export type MinSizeSettings = {
  direction?: unknown;
  hide_title?: unknown;
  layout?: unknown;
  show_details?: unknown;
};

export function minSizeKey(kind: string, settings: MinSizeSettings = {}): string {
  const base = kind === "slider" ? `slider:${settings.direction === "vertical" ? "vertical" : "horizontal"}` : kind;
  if (kind === "toggle" && settings.layout === "inline") {
    return "toggle:inline";
  }
  if (settings.hide_title === true && WIDGET_MIN_SIZE[`${base}:grouped`]) {
    return `${base}:grouped`;
  }
  return base;
}

/** The minimum for a widget as configured, or null for a kind without a declared minimum. */
export function minSizeFor(kind: string, settings: MinSizeSettings = {}): WidgetMinSize | null {
  const entry = WIDGET_MIN_SIZE[minSizeKey(kind, settings)];
  if (!entry) {
    return null;
  }
  return settings.show_details === true ? entry.on : entry.off;
}

export type WidgetSizeShortfall = { minimum: WidgetMinSize; width: number; height: number };

/** The shortfall when a layout is smaller than its kind's minimum; the fix is `Resize to minimum`. */
export function findSizeShortfall(widget: {
  kind: string;
  layout: { width: number; height: number };
  settings?: MinSizeSettings;
}): WidgetSizeShortfall | null {
  const minimum = minSizeFor(widget.kind, widget.settings);
  if (!minimum) {
    return null;
  }
  const { width, height } = widget.layout;
  if (width >= minimum[0] && height >= minimum[1]) {
    return null;
  }
  return { minimum, width, height };
}
