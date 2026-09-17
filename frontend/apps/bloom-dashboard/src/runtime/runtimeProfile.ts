import type { ApplicationConfig, DisplayPreset, RuntimeLanguage, UserProfile } from "@bloom/api-client";

import type { RuntimeProfileOverrides } from "./runtime-profile-overrides";

export type RuntimeProfileViewport = {
  height: number;
  width: number;
};

export type ResolvedRuntimeProfile = {
  audioCues: boolean;
  deadzone: number;
  dwellEnabled: boolean;
  dwellMs: number;
  repeatGuardMs: number;
  scanPeriodMs: number;
  displayPreset: DisplayPreset;
  fontScale: number;
  id: string;
  language: RuntimeLanguage;
  motorAccessibilityPreset: UserProfile["motor_accessibility_preset"];
  name: string;
};

const DEFAULT_RUNTIME_PROFILE: ResolvedRuntimeProfile = {
  audioCues: false,
  deadzone: 0,
  dwellEnabled: false,
  dwellMs: 1000,
  repeatGuardMs: 0,
  scanPeriodMs: 1400,
  displayPreset: "default",
  fontScale: 1,
  id: "default",
  language: "en",
  motorAccessibilityPreset: "default",
  name: "Default",
};

export function resolveRuntimeProfile(
  application: Pick<ApplicationConfig, "profiles">,
  viewport: RuntimeProfileViewport,
  preferredProfileId = "",
  overrides: RuntimeProfileOverrides = {},
): ResolvedRuntimeProfile {
  if (application.profiles.length === 0) {
    return applyRuntimeProfileOverrides(DEFAULT_RUNTIME_PROFILE, overrides);
  }

  const preferredProfile = application.profiles.find((profile) => profile.id === preferredProfileId);
  if (preferredProfile) {
    return applyRuntimeProfileOverrides(normalizeRuntimeProfile(preferredProfile), overrides);
  }

  const preferredDisplayPreset = resolvePreferredDisplayPreset(viewport);
  const exactProfile = application.profiles.find((profile) => profile.display_preset === preferredDisplayPreset);
  const fallbackProfile =
    application.profiles.find((profile) => profile.display_preset === "comfort") ??
    application.profiles.find((profile) => profile.display_preset === "default") ??
    application.profiles[0];

  return applyRuntimeProfileOverrides(
    normalizeRuntimeProfile(exactProfile ?? fallbackProfile ?? DEFAULT_RUNTIME_PROFILE),
    overrides,
  );
}

type LayoutApplication = Pick<ApplicationConfig, "profiles" | "screens">;

/** The profile's control layout when it names a screen, otherwise the first screen (ADR 0133). */
export function resolveInitialScreen(application: LayoutApplication, profileId: string) {
  const layoutId = application.profiles.find((profile) => profile.id === profileId)?.preferred_control_layout_id;
  return application.screens.find((screen) => screen.id === layoutId) ?? application.screens[0];
}

/** The screens a session can switch to: another role's layout is reached through maintenance, not navigation. */
export function resolveNavigableScreens(application: LayoutApplication, profileId: string) {
  const activeLayoutId = resolveInitialScreen(application, profileId)?.id;
  const layoutIds = new Set(application.profiles.map((profile) => profile.preferred_control_layout_id));
  return application.screens.filter((screen) => screen.id === activeLayoutId || !layoutIds.has(screen.id));
}

export function applyRuntimeProfileOverrides(
  profile: ResolvedRuntimeProfile,
  overrides: RuntimeProfileOverrides = {},
): ResolvedRuntimeProfile {
  const motorAccessibilityPreset = overrides.motorAccessibilityPreset ?? profile.motorAccessibilityPreset;
  return {
    ...profile,
    audioCues: overrides.audioCues ?? profile.audioCues,
    deadzone: clampRange(overrides.deadzone ?? profile.deadzone, 0, 0.5),
    dwellEnabled: motorAccessibilityPreset === "dwell" || (overrides.dwellEnabled ?? profile.dwellEnabled),
    dwellMs: clampRange(overrides.dwellMs ?? profile.dwellMs, 400, 4000),
    fontScale: clampFontScale(overrides.fontScale ?? profile.fontScale),
    language: overrides.language ?? profile.language,
    motorAccessibilityPreset,
    repeatGuardMs: clampRange(overrides.repeatGuardMs ?? profile.repeatGuardMs, 0, 600),
    scanPeriodMs: clampRange(overrides.scanPeriodMs ?? profile.scanPeriodMs, 600, 3000),
  };
}

function resolvePreferredDisplayPreset(viewport: RuntimeProfileViewport): DisplayPreset {
  if (viewport.width <= 1024 || viewport.height <= 600) {
    return "high-visibility";
  }

  if (viewport.width <= 1280 || viewport.height <= 800) {
    return "comfort";
  }

  return "default";
}

function normalizeRuntimeProfile(profile: UserProfile | ResolvedRuntimeProfile): ResolvedRuntimeProfile {
  if ("display_preset" in profile) {
    return {
      audioCues: profile.audio_cues === true,
      deadzone: clampRange(profile.deadzone, 0, 0.5),
      dwellEnabled: profile.dwell_enabled === true || profile.motor_accessibility_preset === "dwell",
      dwellMs: clampRange(profile.dwell_ms ?? 1000, 400, 4000),
      repeatGuardMs: clampRange(profile.repeat_guard_ms, 0, 600),
      scanPeriodMs: clampRange(profile.scan_period_ms ?? 1400, 600, 3000),
      displayPreset: profile.display_preset,
      fontScale: clampFontScale(profile.font_scale),
      id: profile.id,
      language: profile.language ?? "en",
      motorAccessibilityPreset: profile.motor_accessibility_preset,
      name: profile.name,
    };
  }

  return {
    audioCues: profile.audioCues,
    deadzone: profile.deadzone,
    dwellEnabled: profile.dwellEnabled,
    dwellMs: profile.dwellMs,
    repeatGuardMs: profile.repeatGuardMs,
    scanPeriodMs: profile.scanPeriodMs,
    displayPreset: profile.displayPreset,
    fontScale: clampFontScale(profile.fontScale),
    id: profile.id,
    language: profile.language,
    motorAccessibilityPreset: profile.motorAccessibilityPreset,
    name: profile.name,
  };
}

function clampRange(value: number | undefined, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(0.75, value));
}
