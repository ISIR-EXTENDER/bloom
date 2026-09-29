import type { ScreenConfig, WidgetActionIntent } from "@bloom/api-client";
import { normalizeWidgetSettings, type WidgetKind } from "@bloom/widgets";
import { describe, expect, it } from "vitest";
import explorerManager from "../../../../../backend/seed/applications/explorer-manager.json";
import kinovaManager from "../../../../../backend/seed/applications/kinova-manager.json";
import { createTeleopCommandRequest } from "../runtime/dispatch-teleop";
import { createStarterScreen } from "./builder-starters";

/**
 * Each word's axis and sign on the wire, as scripts/ros-sim-e2e-checks.mjs pins them per robot: the Explorer's is
 * extender_ui's validated profile (swap XY, invert linear x), the Kinova's the identity. Pivot left is +angular.z.
 */
const WORDS = {
  explorer: { Forward: "linear.x-", Right: "linear.y+", Up: "linear.z+", "Pivot left": "angular.z+" },
  kinova: { Forward: "linear.y+", Right: "linear.x+", Up: "linear.z+", "Pivot left": "angular.z+" },
} as const;
const SEEDS = { explorer: explorerManager, kinova: kinovaManager } as const;
const ROBOT_NAMES = { explorer: "Explorer", kinova: "Kinova" } as const;
const GESTURES = [
  { word: "Forward", title: "Translation", value: { x: 0, y: 1 } },
  { word: "Right", title: "Translation", value: { x: 1, y: 0 } },
  { word: "Up", title: "Height", value: 1 },
  { word: "Pivot left", title: "Pivot", value: -1 },
] as const;

type Widget = ScreenConfig["widgets"][number];

/** What the runtime puts on the wire for one gesture on this widget, as `linear.x-`. */
function wireWord(widget: Widget, value: { x: number; y: number } | number): string {
  const normalized = normalizeWidgetSettings(widget.kind as WidgetKind, widget.settings);
  if (!normalized.success) throw new Error(`${widget.title}: ${JSON.stringify(normalized.errors)}`);
  const settings = normalized.settings as Record<string, unknown>;
  const request = createTeleopCommandRequest({
    type: "value-change",
    modeId: typeof settings.mode_id === "string" ? settings.mode_id : undefined,
    runtimeBinding: settings.runtime_binding,
    value,
    widgetId: widget.id,
    widgetKind: widget.kind,
  } as Extract<WidgetActionIntent, { type: "value-change" }>);
  if (!request) throw new Error(`${widget.title} sends no teleop command`);
  const parts = (["linear", "angular"] as const).flatMap((part) =>
    (["x", "y", "z"] as const)
      .filter((axis) => Math.abs(request[part][axis]) > 1e-6)
      .map((axis) => `${part}.${axis}${request[part][axis] > 0 ? "+" : "-"}`),
  );
  return parts.join(" ");
}

function seedWidget(robot: keyof typeof SEEDS, title: string): Widget {
  const screen = SEEDS[robot].applications[0]?.screens.find((candidate) => candidate.id === "manager_drive_operator");
  const widget = screen?.widgets.find((candidate) => candidate.title === title);
  if (!widget) throw new Error(`${robot} seed has no ${title} on manager_drive_operator`);
  return widget as unknown as Widget;
}

describe("a new app's drive controls", () => {
  // The owner watched a new app's Forward on the Explorer; the pad, height and pivot must send what the Manager does.
  describe.each(["explorer", "kinova"] as const)("on the %s", (robot) => {
    const screen = createStarterScreen("operator-control", true, ROBOT_NAMES[robot]);

    it.each(GESTURES)("sends $word on the robot's own axis and sign", ({ word, title, value }) => {
      const widget = screen.widgets.find((candidate) => candidate.title === title);
      if (!widget) throw new Error(`the operator starter has no ${title}`);

      expect(wireWord(widget, value)).toBe(WORDS[robot][word]);
      expect(wireWord(widget, value)).toBe(wireWord(seedWidget(robot, title), value));
    });
  });
});
