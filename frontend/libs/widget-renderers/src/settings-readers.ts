import type { JoystickLabels } from "./JoystickPrimitive";

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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
