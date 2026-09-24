import { resolveJoystickControlSize, resolveTitlePlacement } from "./control-geometry.ts";
import { padGeometry } from "./pad-geometry.ts";

export type WidgetMinSize = readonly [width: number, height: number];

/**
 * Minimum size per widget kind at scale 1.0, derived from what each renderer draws (ADR 0132,
 * docs/design/widget-min-size.md). The builder inspector, the review checklist and the seed validator read this one table.
 */
/** The title line and the gap under it, per docs/design/widget-min-size.md. */
const HIDDEN_TITLE_PX = 32;

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
  title_placement?: unknown;
};

function minSizeKey(kind: string, settings: MinSizeSettings = {}): string {
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
  const key = minSizeKey(kind, settings);
  const entry = WIDGET_MIN_SIZE[key];
  if (!entry) {
    return null;
  }
  const size = settings.show_details === true ? entry.on : entry.off;
  // A hidden title gives back the title and its gap; the grouped rows already did.
  return settings.hide_title === true && !key.endsWith(":grouped") ? [size[0], size[1] - HIDDEN_TITLE_PX] : size;
}

export type PrimaryTargetLayout = { height: number; width: number };
export type PrimaryTargetSettings = MinSizeSettings & { returnToCenter?: unknown; variant?: unknown };

/**
 * What the hand meets inside a card, in canvas px (design-system §04b). A kind absent from the table
 * declares no target, which is also what makes it non-interactive.
 */
const PRIMARY_TARGET: Readonly<
  Record<string, (settings: PrimaryTargetSettings, layout: PrimaryTargetLayout, targetPx: number) => number>
> = {
  // The renderer grows the button to the role's touch target (runtime-app.css, --runtime-control-touch-target)
  // as far as the card allows, so the contract reports that rather than a flat 56.
  "command-button": (settings, layout, targetPx) =>
    settings.hide_title === true ? layout.height - 32 : Math.min(Math.max(56, targetPx), layout.height - 32),
  "gesture-pad": (_settings, layout) => Math.min(layout.width, layout.height),
  // The knob of the pad the renderer draws, not of the card: the title row and the readouts come off
  // the edge first, so a card measured whole reports a target the hand never meets.
  joystick: (settings, layout) => {
    const showDetails = settings.show_details === true;
    const placement = resolveTitlePlacement({ kind: "joystick", layout, settings }, showDetails);
    return padGeometry(resolveJoystickControlSize(layout.width, layout.height, { placement, showDetails })).knob;
  },
  slider: (settings) => (settings.variant === "segments" || settings.returnToCenter === true ? 64 : 56),
  toggle: (_settings, layout, targetPx) => Math.min(Math.max(56, targetPx), layout.height - 32),
};

/** The kinds the touch floor and the overlap rule apply to: the ones that declare a target. */
export const INTERACTIVE_WIDGET_KINDS: ReadonlySet<string> = new Set(Object.keys(PRIMARY_TARGET));

/** Nothing an operator acts on may land below this much glass, after fit-scaling (decision 0132). */
export const TOUCH_FLOOR_PX = 44;

export type DisplayPreset = "compact" | "comfort" | "default" | "high-visibility";

/**
 * What a role's tagline promises the hand, in canvas px (design-system §04b). It belongs beside
 * `primaryTargetFor`, which is what a widget actually delivers: the library, Settings and the sweep all
 * compare the two, and three copies of the table could drift apart without a test noticing.
 */
export const PROFILE_TARGET_PX: Readonly<Record<DisplayPreset, number>> = {
  compact: 40,
  comfort: 56,
  default: 48,
  "high-visibility": 64,
};

/**
 * The target for a widget as configured, or null for a kind that is not something to hit. `targetPx` is
 * the role's touch target (PROFILE_TARGET_PX): a button or toggle grows to it when the card has room.
 */
export function primaryTargetFor(
  kind: string,
  settings: PrimaryTargetSettings,
  layout: PrimaryTargetLayout,
  targetPx: number = PROFILE_TARGET_PX.default,
): number | null {
  return PRIMARY_TARGET[kind]?.(settings, layout, targetPx) ?? null;
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
