import {
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  isRecord,
  type JoystickSettings,
  MAX_JOYSTICK_PUBLISH_RATE_HZ,
} from "@bloom/widgets";
import type { JoystickLabels } from "./JoystickPrimitive";

export type ResolvedJoystickBinding = {
  axisSummary: string;
  /** Knob colour token: translation sage, rotation clay — never a hex. */
  knobColor: string;
  labels: JoystickLabels;
  modeId: string;
  publishRateHz: number;
  runtimeTarget: string;
  zeroOnRelease: boolean;
};

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
  const runtimeTarget = getStringSetting(runtimeBinding, "target", "");
  const isRotation = axisHints.x.semantic === "rotation" || /rotation|angular/.test(runtimeTarget);

  return {
    axisSummary: `${axisHints.x.semantic} / ${axisHints.y.semantic}`,
    knobColor: isRotation ? "var(--bloom-axis-rotation)" : "var(--bloom-axis-translation)",
    labels,
    modeId: getStringSetting(settings, "mode_id", getStringSetting(settings, "binding", "input")),
    publishRateHz: clamp(getNumberSetting(settings, "publish_rate_hz", 30), 1, MAX_JOYSTICK_PUBLISH_RATE_HZ),
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
  // One spelling. The seeds used to carry an `axes` block that normalization replaced before this
  // could read it, so it said one thing and the screen drew another.
  const axisHints = isRecord(settings.axis_hints) ? settings.axis_hints : {};
  const defaultSemantic = getStringSetting(settings, "binding", "joy") === "rot" ? "rotation" : "translation";
  const defaultColor = defaultSemantic === "rotation" ? "var(--bloom-axis-rotation)" : "var(--bloom-axis-translation)";

  return {
    x: getJoystickAxisHint(axisHints.x, {
      color: defaultColor,
      negative_label: defaultSemantic === "rotation" ? "RX-" : "X-",
      positive_label: defaultSemantic === "rotation" ? "RX+" : "X+",
      semantic: defaultSemantic,
    }),
    y: getJoystickAxisHint(axisHints.y, {
      color: defaultColor,
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
