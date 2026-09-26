import type { ScreenConfig } from "@bloom/api-client";
import type { ScreenFeature } from "./app-config-model";

export type ScreenLibraryType = "camera" | "control" | "debug" | "device" | "workflow" | "general";

/** The one screen classifier: Home groups by it and the app config colours its cards from it. */
export function classifyScreen(screen: ScreenConfig): ScreenLibraryType {
  const screenText = `${screen.id} ${screen.title}`.toLowerCase();
  const widgetKinds = new Set(screen.widgets.map((widget) => widget.kind));

  if (widgetKinds.has("camera") || includesAny(screenText, ["camera", "stream", "video", "webcam"])) {
    return "camera";
  }

  if (
    widgetKinds.has("joystick") ||
    widgetKinds.has("slider") ||
    widgetKinds.has("command-button") ||
    widgetKinds.has("toggle") ||
    includesAny(screenText, ["control", "drive", "teleop", "command"])
  ) {
    return "control";
  }

  if (
    widgetKinds.has("gauge") ||
    widgetKinds.has("plot") ||
    widgetKinds.has("plot-board") ||
    widgetKinds.has("value-strip") ||
    widgetKinds.has("event-log") ||
    widgetKinds.has("topic-echo") ||
    widgetKinds.has("topic-plot") ||
    includesAny(screenText, ["debug", "diagnostic", "log", "monitor", "topic"])
  ) {
    return "debug";
  }

  if (includesAny(screenText, ["device", "gripper", "magnet", "pump", "sensor", "actuator"])) {
    return "device";
  }

  if (includesAny(screenText, ["config", "state", "workflow", "petanque", "setup"])) {
    return "workflow";
  }

  return "general";
}

const FEATURE_BY_TYPE: Record<ScreenLibraryType, ScreenFeature> = {
  camera: "camera",
  control: "controls",
  debug: "debug",
  device: "interface",
  general: "interface",
  workflow: "interface",
};

export function resolveScreenFeature(screen: ScreenConfig): ScreenFeature {
  return screen.widgets.length === 0 ? "empty" : FEATURE_BY_TYPE[classifyScreen(screen)];
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}
