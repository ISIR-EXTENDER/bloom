import type {
  ApplicationConfig,
  CanvasSettings,
  ReservedRegion,
  ScreenConfig,
  WidgetConfig,
  WidgetLayout,
} from "@bloom/api-client";
import { resolveJoystickControlSize, resolveTitlePlacement } from "@bloom/widget-renderers";
import {
  BENCH_RAIL,
  findSizeShortfall,
  primaryTargetFor,
  resolveCanvasPresetSize,
  TOUCH_FLOOR_PX,
  type WidgetSizeShortfall,
} from "@bloom/widgets";

import { resolveRuntimeArtboardSize } from "../runtime/runtime-canvas-fit";

export const KIOSK_BAR_HEIGHT = 44;
export { TOUCH_FLOOR_PX };

/**
 * The box STOP is drawn in, placed as the shipped screens place it: the bottom of the right-hand rail.
 *
 * A screen without one is not a screen without STOP -- the runtime falls back to a corner and floats it
 * over whatever is underneath. Reserving the box is what keeps every control clear of it, and it is also
 * what makes the screen full-panel, so its absence quietly changes the fit scale too.
 */
export function defaultStopRegion(canvas: CanvasSettings): ReservedRegion {
  const preset = resolveCanvasPresetSize(canvas);
  // The bench rail's own box, so one screen's STOP is the same size as every other's.
  const width = Math.min(BENCH_RAIL.stop.width, Math.round(preset.width * 0.27));
  const height = Math.min(BENCH_RAIL.stop.height, Math.round(preset.height * 0.35));
  return {
    id: "stop",
    owner: "runtime-chrome",
    x: Math.max(0, preset.width - width - 14),
    y: Math.max(0, preset.height - height - 58),
    width,
    height,
  };
}

/** The desktop floor is the mouse one (device-classes.md); the touch floor belongs to the tablet. */
const DESKTOP_DENSITY_FLOOR_PX = 40;

/** The smallest a target may be on this class's own checked panel. */
export function densityFloorFor(deviceClass: DeviceClass): number {
  return deviceClass === "desktop" ? DESKTOP_DENSITY_FLOOR_PX : TOUCH_FLOOR_PX;
}

export type DeviceClass = "desktop" | "tablet";

/** Each class is checked at its smallest panel (device-classes.md): what an author ships must work there. */
const CHECKED_PANEL: Record<DeviceClass, { height: number; width: number }> = {
  desktop: { height: 900, width: 1440 },
  tablet: { height: 600, width: 1024 },
};

/** Only the 1920×1080 presets are desktop. `hd` is 1280×720 and `wide-tablet` 1820×720: both tablet. */
const DESKTOP_PRESETS = new Set(["full-hd", "local-screen"]);

/** The canvas a new tablet screen starts on: the 1280×720 panel the device switch and shipped screens use. */
export const NEW_TABLET_CANVAS: CanvasSettings = { preset_id: "native-1280x720", runtime_mode: "fit" };

/** A new screen in an app follows a desktop app's canvas; every other app gets the tablet panel. */
export function resolveNewScreenCanvas(application: Pick<ApplicationConfig, "screens">): CanvasSettings {
  const first = application.screens[0];
  return first && resolveDeviceClass(first) === "desktop" ? { ...first.canvas } : { ...NEW_TABLET_CANVAS };
}

export function resolveDeviceClass(screen: Pick<ScreenConfig, "canvas">): DeviceClass {
  return DESKTOP_PRESETS.has(screen.canvas.preset_id) ? "desktop" : "tablet";
}

/** The canvas an author places widgets on, and the scale it reaches the glass at on the class's smallest panel. */
export function resolveBuilderPanel(screen: ScreenConfig) {
  const artboard = resolveRuntimeArtboardSize(screen);
  const panel = CHECKED_PANEL[resolveDeviceClass(screen)];
  const glassScale = Math.min(1, panel.width / artboard.width, (panel.height - KIOSK_BAR_HEIGHT) / artboard.height);
  return {
    artboard,
    deviceClass: resolveDeviceClass(screen),
    glassScale,
    preset: resolveCanvasPresetSize(screen.canvas),
  };
}

/** The target a hand meets inside a widget, in canvas px; a kind that declares none is read at its card. */
export function resolvePrimaryTarget(widget: WidgetConfig): number {
  return (
    primaryTargetFor(widget.kind, widget.settings, widget.layout) ?? Math.min(widget.layout.width, widget.layout.height)
  );
}

/** Whole glass px, floored so a 43.5 px target reads 43 and fails the 44 px floor instead of rounding up to pass. */
export function glassPx(widget: WidgetConfig, glassScale: number): number {
  return Math.floor(resolvePrimaryTarget(widget) * glassScale + 1e-9);
}

export function findUndersizedWidgets(
  screen: ScreenConfig,
): { shortfall: WidgetSizeShortfall; widget: WidgetConfig }[] {
  return screen.widgets.flatMap((widget) => {
    const shortfall = findSizeShortfall(widget);
    return shortfall ? [{ shortfall, widget }] : [];
  });
}

export function overlapsRegion(layout: WidgetLayout, regions: readonly ReservedRegion[] = []): ReservedRegion | null {
  return (
    regions.find(
      (region) =>
        layout.x < region.x + region.width &&
        region.x < layout.x + layout.width &&
        layout.y < region.y + region.height &&
        region.y < layout.y + layout.height,
    ) ?? null
  );
}

/** Why a layout cannot stand on this screen, or null when it sits inside the canvas and clear of every region. */
export function explainLayoutRefusal(layout: WidgetLayout, screen: ScreenConfig): string | null {
  const { artboard } = resolveBuilderPanel(screen);
  const region = overlapsRegion(layout, screen.reserved_regions);
  if (region) {
    return `it would reach into the reserved ${region.id === "stop" ? "STOP" : region.id} region`;
  }
  if (
    layout.x < 0 ||
    layout.y < 0 ||
    layout.x + layout.width > artboard.width ||
    layout.y + layout.height > artboard.height
  ) {
    return `it would run past the ${artboard.width}×${artboard.height} canvas`;
  }
  return null;
}

/**
 * The first grid position, reading on from the proposed one and then wrapping to the top, where a widget sits inside
 * the canvas and clear of every reserved region; null when nowhere fits, so the caller can refuse and say why.
 */
/** A layout moved clear of the reserved regions, scanning the canvas on a 24 px grid. */
export function placeClearOfRegions(layout: WidgetLayout, screen: ScreenConfig): WidgetLayout | null {
  return findFreePlacement(layout, screen, []);
}

/**
 * Where a widget added from the palette lands: clear of the regions, and of what is already there.
 *
 * Separate from `placeClearOfRegions` because a duplicate wants the opposite: a copy belongs beside
 * its original, overlapping it, not flung to the first free corner.
 *
 * A canvas with no free space still places, on top, because refusing to add a widget because the
 * screen is busy would be worse than an overlap the author can drag apart.
 */
export function placeClearOfWidgets(layout: WidgetLayout, screen: ScreenConfig): WidgetLayout | null {
  const occupied = screen.widgets.map((widget) => widget.layout);
  return findFreePlacement(layout, screen, occupied) ?? findFreePlacement(layout, screen, []);
}

function findFreePlacement(
  layout: WidgetLayout,
  screen: ScreenConfig,
  occupied: readonly WidgetLayout[],
): WidgetLayout | null {
  const { artboard } = resolveBuilderPanel(screen);
  const regions = screen.reserved_regions ?? [];
  const lastX = artboard.width - layout.width;
  const lastY = artboard.height - layout.height;
  const startX = Math.max(0, layout.x);
  const startY = Math.max(0, layout.y);
  const rows: number[] = [];
  for (let y = startY; y <= lastY; y += 24) rows.push(y);
  for (let y = startY % 24; y < startY && y <= lastY; y += 24) rows.push(y);
  if (rows[0] === startY) rows.push(startY);

  for (const [index, y] of rows.entries()) {
    for (let x = index === 0 && y === startY ? startX : 0; x <= lastX; x += 24) {
      const candidate = { ...layout, x, y };
      if (!overlapsRegion(candidate, regions) && !occupied.some((taken) => boxesOverlap(candidate, taken))) {
        return candidate;
      }
    }
  }
  return null;
}

function boxesOverlap(left: WidgetLayout, right: WidgetLayout): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

export type ReviewRule = { detail: string; id: string; passed: boolean; title: string };

/** Minimum size, sibling symmetry, pad rows, profile coverage and paired-app policy (ADR 0132, 0133). */
export function reviewScreens(
  application: ApplicationConfig,
  siblings: readonly ApplicationConfig[] = [],
): ReviewRule[] {
  const undersized = application.screens.flatMap((screen) =>
    findUndersizedWidgets(screen).map((entry) => ({ ...entry, screen })),
  );
  const asymmetric = application.screens.flatMap((screen) =>
    findAsymmetricSiblings(screen).map((pair) => ({ pair, screen })),
  );
  const mismatchedPads = application.screens.flatMap((screen) => {
    const mismatch = findPadMismatch(screen);
    return mismatch ? [{ ...mismatch, screen }] : [];
  });
  const uncovered = application.profiles.filter(
    (profile) =>
      profile.preferred_control_layout_id !== "" &&
      !application.screens.some((screen) => screen.id === profile.preferred_control_layout_id),
  );
  const pair = siblings.find(
    (candidate) => candidate.id === `${application.id}-desktop` || `${candidate.id}-desktop` === application.id,
  );
  const policyDrift = pair ? findPolicyDrift(application, pair) : [];

  return [
    {
      id: "minimum",
      title: "Every widget meets its minimum size",
      passed: undersized.length === 0,
      detail:
        undersized.length === 0
          ? "No widget is smaller than its kind needs."
          : `${undersized[0]?.widget.title} on ${undersized[0]?.screen.title} needs ${undersized[0]?.shortfall.minimum.join("×")}${undersized.length > 1 ? `, and ${undersized.length - 1} more` : ""}.`,
    },
    {
      id: "symmetry",
      title: "Siblings in a row share a size",
      passed: asymmetric.length === 0,
      detail:
        asymmetric.length === 0
          ? "Widgets of one kind side by side are the same height."
          : `${asymmetric[0]?.pair[0].title} and ${asymmetric[0]?.pair[1].title} on ${asymmetric[0]?.screen.title} differ in height.`,
    },
    {
      id: "pads",
      title: "Pads in a row share one card, one square and one centre line",
      passed: mismatchedPads.length === 0,
      detail:
        mismatchedPads.length === 0
          ? "Every screen's joysticks share a card size, the square the renderer draws inside it, and a centre line."
          : `${mismatchedPads[0]?.pad.title} on ${mismatchedPads[0]?.screen.title} ${PAD_MISMATCH_REASON[mismatchedPads[0]?.reason ?? "card"]}.`,
    },
    {
      id: "profiles",
      title: "Every profile opens a screen that exists",
      passed: uncovered.length === 0,
      detail:
        uncovered.length === 0
          ? "Each profile's layout resolves, or the profile opens the first screen."
          : `${uncovered[0]?.name} names ${uncovered[0]?.preferred_control_layout_id}, which is not a screen.`,
    },
    {
      id: "pairs",
      title: "Paired apps publish the same way",
      passed: policyDrift.length === 0,
      detail: !pair
        ? "No paired desktop app yet; the check starts when one is added."
        : policyDrift.length === 0
          ? `${application.name} and ${pair.name} share topics, frame and allowlists.`
          : `${pair.name} differs in ${policyDrift.join(", ")}.`,
    },
  ];
}

function findAsymmetricSiblings(screen: ScreenConfig): [WidgetConfig, WidgetConfig][] {
  const pairs: [WidgetConfig, WidgetConfig][] = [];
  screen.widgets.forEach((left, index) => {
    for (const right of screen.widgets.slice(index + 1)) {
      if (
        variantOf(left) === variantOf(right) &&
        left.kind !== "label" &&
        left.layout.y === right.layout.y &&
        left.layout.height !== right.layout.height
      ) {
        pairs.push([left, right]);
      }
    }
  });
  return pairs;
}

function variantOf(widget: WidgetConfig): string {
  return [widget.kind, widget.settings.direction, widget.settings.variant, widget.settings.hide_title].join(":");
}

/** The square edge the renderer draws inside a card: one number, so the pad is square by construction. */
function padSurface(pad: WidgetConfig): number {
  const showDetails = pad.settings.show_details === true;
  return resolveJoystickControlSize(pad.layout.width, pad.layout.height, {
    placement: resolveTitlePlacement(pad, showDetails),
    showDetails,
  });
}

const PAD_MISMATCH_REASON: Record<PadMismatch["reason"], string> = {
  card: "is a different card size from the first pad",
  square: "yields a different pad square from the first pad",
  centre: "sits on a different centre line from the first pad",
};

type PadMismatch = { pad: WidgetConfig; reason: "card" | "centre" | "square" };

/** Pad recipe rules 3 and 4: one card size, the same square inside it, one centre line. */
function findPadMismatch(screen: ScreenConfig): PadMismatch | null {
  const pads = screen.widgets.filter((widget) => widget.kind === "joystick");
  const [first] = pads;
  if (!first) {
    return null;
  }
  const centre = (pad: WidgetConfig) => pad.layout.y + pad.layout.height / 2;
  for (const pad of pads.slice(1)) {
    if (pad.layout.width !== first.layout.width || pad.layout.height !== first.layout.height) {
      return { pad, reason: "card" };
    }
    if (padSurface(pad) !== padSurface(first)) {
      return { pad, reason: "square" };
    }
    if (centre(pad) !== centre(first)) {
      return { pad, reason: "centre" };
    }
  }
  return null;
}

function findPolicyDrift(left: ApplicationConfig, right: ApplicationConfig): string[] {
  const a = left.runtime_policy;
  const b = right.runtime_policy;
  const same = (x: readonly string[] = [], y: readonly string[] = []) => [...x].sort().join() === [...y].sort().join();
  const drift: string[] = [];
  if (!same(a.allowed_publish_topics, b.allowed_publish_topics)) drift.push("publish topics");
  if (!same(a.allowed_message_types, b.allowed_message_types)) drift.push("message types");
  if (!same(a.allowed_teleop_targets, b.allowed_teleop_targets)) drift.push("teleop targets");
  if (!same(a.allowed_service_calls, b.allowed_service_calls)) drift.push("service calls");
  if ((a.command_frame_id ?? "") !== (b.command_frame_id ?? "")) drift.push("command frame");
  return drift;
}
