import type { JoystickSettings } from "@bloom/widgets";
import type { JoystickLabelColors, JoystickLabels } from "./JoystickPrimitive";

export type ResolvedJoystickBinding = {
  axisSummary: string;
  labelColors: JoystickLabelColors;
  labels: JoystickLabels;
  modeId: string;
  publishRateHz: number;
  runtimeTarget: string;
  zeroOnRelease: boolean;
};

export function getStringSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function getNumberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getBooleanSetting(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

export function getJoystickLabels(settings: Record<string, unknown>): JoystickLabels {
  const labels = settings.labels;
  if (!isRecord(labels)) {
    return { bottom: "Y-", left: "X-", right: "X+", top: "Y+" };
  }

  return {
    bottom: getStringSetting(labels, "bottom", "Y-"),
    left: getStringSetting(labels, "left", "X-"),
    right: getStringSetting(labels, "right", "X+"),
    top: getStringSetting(labels, "top", "Y+"),
  };
}

export function resolveJoystickBinding(settings: Record<string, unknown>): ResolvedJoystickBinding {
  const axisHints = getJoystickAxisHints(settings);
  const labels = getJoystickLabelsFromAxisHints(settings, axisHints);
  const runtimeBinding = isRecord(settings.runtime_binding) ? settings.runtime_binding : {};

  return {
    axisSummary: `${axisHints.x.semantic} / ${axisHints.y.semantic}`,
    labelColors: {
      bottom: axisHints.y.color,
      left: axisHints.x.color,
      right: axisHints.x.color,
      top: axisHints.y.color,
    },
    labels,
    modeId: getStringSetting(settings, "mode_id", getStringSetting(settings, "binding", "input")),
    publishRateHz: clamp(getNumberSetting(settings, "publish_rate_hz", 30), 1, 120),
    runtimeTarget: getStringSetting(runtimeBinding, "target", getStringSetting(settings, "binding", "input")),
    zeroOnRelease: getBooleanSetting(settings, "zero_on_release", true),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getJoystickLabelsFromAxisHints(
  settings: Record<string, unknown>,
  axisHints: JoystickSettings["axis_hints"],
): JoystickLabels {
  if (isRecord(settings.labels)) {
    return getJoystickLabels(settings);
  }

  return {
    bottom: axisHints.y.negative_label,
    left: axisHints.x.negative_label,
    right: axisHints.x.positive_label,
    top: axisHints.y.positive_label,
  };
}

function getJoystickAxisHints(settings: Record<string, unknown>): JoystickSettings["axis_hints"] {
  const axisHints = isRecord(settings.axis_hints) ? settings.axis_hints : {};
  const defaultSemantic = getStringSetting(settings, "binding", "joy") === "rot" ? "rotation" : "translation";
  const defaultColor = defaultSemantic === "rotation" ? "#95a5c8" : "#7fa95f";

  return {
    x: getJoystickAxisHint(axisHints.x, {
      color: defaultColor,
      negative_label: defaultSemantic === "rotation" ? "RX-" : "X-",
      positive_label: defaultSemantic === "rotation" ? "RX+" : "X+",
      semantic: defaultSemantic,
    }),
    y: getJoystickAxisHint(axisHints.y, {
      color: defaultSemantic === "rotation" ? "#c8a3cf" : "#d89f5d",
      negative_label: defaultSemantic === "rotation" ? "RY-" : "Y-",
      positive_label: defaultSemantic === "rotation" ? "RY+" : "Y+",
      semantic: defaultSemantic,
    }),
  };
}

function getJoystickAxisHint(
  value: unknown,
  fallback: JoystickSettings["axis_hints"]["x"],
): JoystickSettings["axis_hints"]["x"] {
  if (!isRecord(value)) {
    return fallback;
  }

  const semantic = getStringSetting(value, "semantic", fallback.semantic);
  return {
    color: getStringSetting(value, "color", fallback.color),
    negative_label: getStringSetting(value, "negative_label", fallback.negative_label),
    positive_label: getStringSetting(value, "positive_label", fallback.positive_label),
    semantic: isJoystickAxisSemantic(semantic) ? semantic : fallback.semantic,
  };
}

function isJoystickAxisSemantic(value: string): value is JoystickSettings["axis_hints"]["x"]["semantic"] {
  return ["custom", "rotation", "translation", "vertical"].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
