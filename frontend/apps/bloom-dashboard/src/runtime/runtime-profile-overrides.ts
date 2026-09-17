import type { RuntimeLanguage, UserProfile } from "@bloom/api-client";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";

export type RuntimeProfileOverrides = {
  audioCues?: boolean;
  deadzone?: number;
  dwellEnabled?: boolean;
  dwellMs?: number;
  fontScale?: number;
  language?: RuntimeLanguage;
  motorAccessibilityPreset?: UserProfile["motor_accessibility_preset"];
  repeatGuardMs?: number;
  scanPeriodMs?: number;
};

const MOTOR_ACCESSIBILITY_PRESETS = new Set<UserProfile["motor_accessibility_preset"]>([
  "assisted-touch",
  "default",
  "dwell",
  "large-targets",
  "latch",
  "reduced-motion",
  "scan",
  "step",
]);
const RUNTIME_LANGUAGES = new Set<RuntimeLanguage>(["en", "es", "fr"]);

/** The one place a stored preference is keyed to an app: settings, the remembered role and tour progress share it. */
export function runtimePreferenceKey(selection: Pick<WorkspaceSelection, "appId" | "configId">): string {
  return `${selection.configId}:${selection.appId}`;
}

export function runtimeProfileOverrideKey(
  selection: Pick<WorkspaceSelection, "appId" | "configId">,
  profileId: string,
): string {
  return `${runtimePreferenceKey(selection)}:${profileId}`;
}

export function normalizeRuntimeProfileOverrides(value: unknown): RuntimeProfileOverrides {
  if (!isRecord(value)) {
    return {};
  }

  const overrides: RuntimeProfileOverrides = {};
  copyBoolean(value, "audioCues", overrides);
  copyBoolean(value, "dwellEnabled", overrides);
  copyFiniteNumber(value, "deadzone", overrides);
  copyFiniteNumber(value, "dwellMs", overrides);
  copyFiniteNumber(value, "fontScale", overrides);
  copyFiniteNumber(value, "repeatGuardMs", overrides);
  copyFiniteNumber(value, "scanPeriodMs", overrides);

  if (typeof value.language === "string" && RUNTIME_LANGUAGES.has(value.language as RuntimeLanguage)) {
    overrides.language = value.language as RuntimeLanguage;
  }
  if (
    typeof value.motorAccessibilityPreset === "string" &&
    MOTOR_ACCESSIBILITY_PRESETS.has(value.motorAccessibilityPreset as UserProfile["motor_accessibility_preset"])
  ) {
    overrides.motorAccessibilityPreset = value.motorAccessibilityPreset as UserProfile["motor_accessibility_preset"];
  }

  return overrides;
}

function copyBoolean<Key extends "audioCues" | "dwellEnabled">(
  source: Record<string, unknown>,
  key: Key,
  target: RuntimeProfileOverrides,
): void {
  if (typeof source[key] === "boolean") {
    target[key] = source[key];
  }
}

function copyFiniteNumber<Key extends "deadzone" | "dwellMs" | "fontScale" | "repeatGuardMs" | "scanPeriodMs">(
  source: Record<string, unknown>,
  key: Key,
  target: RuntimeProfileOverrides,
): void {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
