import type { ApplicationConfig, DisplayPreset, UserProfile } from "@bloom/api-client";

export type RuntimeProfileViewport = {
  height: number;
  width: number;
};

export type ResolvedRuntimeProfile = {
  displayPreset: DisplayPreset;
  fontScale: number;
  id: string;
  motorAccessibilityPreset: UserProfile["motor_accessibility_preset"];
  name: string;
};

const DEFAULT_RUNTIME_PROFILE: ResolvedRuntimeProfile = {
  displayPreset: "default",
  fontScale: 1,
  id: "default",
  motorAccessibilityPreset: "default",
  name: "Default",
};

export function resolveRuntimeProfile(
  application: Pick<ApplicationConfig, "profiles">,
  viewport: RuntimeProfileViewport,
  preferredProfileId = "",
): ResolvedRuntimeProfile {
  if (application.profiles.length === 0) {
    return DEFAULT_RUNTIME_PROFILE;
  }

  const preferredProfile = application.profiles.find((profile) => profile.id === preferredProfileId);
  if (preferredProfile) {
    return normalizeRuntimeProfile(preferredProfile);
  }

  const preferredDisplayPreset = resolvePreferredDisplayPreset(viewport);
  const exactProfile = application.profiles.find((profile) => profile.display_preset === preferredDisplayPreset);
  const fallbackProfile =
    application.profiles.find((profile) => profile.display_preset === "comfort") ??
    application.profiles.find((profile) => profile.display_preset === "default") ??
    application.profiles[0];

  return normalizeRuntimeProfile(exactProfile ?? fallbackProfile ?? DEFAULT_RUNTIME_PROFILE);
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
      displayPreset: profile.display_preset,
      fontScale: clampFontScale(profile.font_scale),
      id: profile.id,
      motorAccessibilityPreset: profile.motor_accessibility_preset,
      name: profile.name,
    };
  }

  return {
    displayPreset: profile.displayPreset,
    fontScale: clampFontScale(profile.fontScale),
    id: profile.id,
    motorAccessibilityPreset: profile.motorAccessibilityPreset,
    name: profile.name,
  };
}

function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(0.75, value));
}
