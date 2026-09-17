import type { ApplicationConfig, ReservedRegion, ScreenConfig, WidgetConfig, WidgetLayout } from "@bloom/api-client";
import { findSizeShortfall, resolveCanvasPresetSize, type WidgetSizeShortfall } from "@bloom/widgets";

import { resolveRuntimeArtboardSize } from "../runtime/runtime-canvas-fit";

export const KIOSK_BAR_HEIGHT = 44;
export const TOUCH_FLOOR_PX = 44;

export type DeviceClass = "desktop" | "tablet";

/** Each class is checked at its smallest panel (device-classes.md): what an author ships must work there. */
const CHECKED_PANEL: Record<DeviceClass, { height: number; width: number }> = {
  desktop: { height: 900, width: 1440 },
  tablet: { height: 600, width: 1024 },
};

const DESKTOP_PRESETS = new Set(["full-hd", "local-screen"]);

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

/** The target a hand actually meets inside a widget, in canvas px (the renderers' anatomy, design-system §06). */
export function resolvePrimaryTarget(widget: WidgetConfig): number {
  const { height, width } = widget.layout;
  switch (widget.kind) {
    case "command-button":
      return widget.settings.hide_title === true ? height - 32 : Math.min(56, height - 32);
    case "toggle":
      return 56;
    case "joystick":
      return Math.round(Math.min(width, height) * 0.26);
    case "slider":
      return widget.settings.variant === "segments" ? 64 : widget.settings.returnToCenter === true ? 64 : 40;
    default:
      return Math.min(width, height);
  }
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

/** A move or resize into a reserved region keeps the last legal layout: the region refuses the drop. */
export function refuseReservedRegion(
  proposed: WidgetLayout,
  fallback: WidgetLayout,
  regions: readonly ReservedRegion[] = [],
): WidgetLayout {
  return overlapsRegion(proposed, regions) ? fallback : proposed;
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
export function placeClearOfRegions(layout: WidgetLayout, screen: ScreenConfig): WidgetLayout | null {
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
      if (!overlapsRegion(candidate, regions)) {
        return candidate;
      }
    }
  }
  return null;
}

export type ReviewRule = { detail: string; id: string; passed: boolean; title: string };

/** Minimum size, sibling symmetry, pad pairs, profile coverage and paired-app policy (ADR 0132, 0133). */
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
  const unpaired = application.screens.flatMap((screen) => (padsAreSquarePairs(screen) ? [] : [screen]));
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
      title: "Pads are matched squares on one centre line",
      passed: unpaired.length === 0,
      detail:
        unpaired.length === 0
          ? "Every screen's joysticks share a size and a centre line."
          : `The joysticks on ${unpaired[0]?.title} differ in size or centre line.`,
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

function padsAreSquarePairs(screen: ScreenConfig): boolean {
  const pads = screen.widgets.filter((widget) => widget.kind === "joystick");
  if (pads.length < 2) {
    return true;
  }
  const [first] = pads;
  if (!first) {
    return true;
  }
  const centre = (widget: WidgetConfig) => widget.layout.y + widget.layout.height / 2;
  return pads.every(
    (pad) =>
      pad.layout.width === first.layout.width &&
      pad.layout.height === first.layout.height &&
      centre(pad) === centre(first),
  );
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
