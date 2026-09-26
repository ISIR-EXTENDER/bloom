import type { ApplicationConfig, RuntimeActionPreset, ScreenConfig } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS, type BloomThemePresetId } from "@bloom/ui";
import { getRosMessageCommandPresetsByCategory, type RosMessageCommandPreset } from "@bloom/widgets";
import type { CSSProperties } from "react";
import { createUniqueId } from "../configurations/configuration-editor";
import { resolveScreenFeature } from "./screen-classification";

export { resolveScreenFeature };

export type AppSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export type AvailableScreen = {
  screen: ScreenConfig;
  sourceApplicationName: string;
};

export type ScreenFeature = "camera" | "controls" | "debug" | "empty" | "interface";

export type ThemeInspiration = ApplicationConfig["theme"]["inspiration"];

export const MAX_MOODBOARD_IMAGE_BYTES = 1_000_000;
export const ACCEPTED_MOODBOARD_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const DEFAULT_THEME_INSPIRATION: ThemeInspiration = {
  moodboard_image_uri: "",
  reference_url: "",
};
export const commandPresetGroupsFor = (robotName?: string | null) =>
  Array.from(getRosMessageCommandPresetsByCategory(robotName));
export const APP_THEME_PRESETS: ReadonlyArray<{
  id: "bloom-default" | Extract<BloomThemePresetId, "extender-ui" | "high-contrast">;
  label: string;
  description: string;
  palette: ApplicationConfig["theme"]["palette"];
}> = [
  {
    id: "extender-ui",
    label: "Extender UI",
    description: BLOOM_THEME_PRESETS["extender-ui"].description,
    palette: {
      accent: "#0ea5e9",
      background: "#f8fafc",
      primary: "#1d4ed8",
      surface: "#ffffff",
    },
  },
  {
    id: "high-contrast",
    label: "High visibility",
    description: BLOOM_THEME_PRESETS["high-contrast"].description,
    palette: {
      accent: "#ffcc00",
      background: "#ffffff",
      primary: "#0033cc",
      surface: "#ffffff",
    },
  },
  {
    id: "bloom-default",
    label: "Bloom Garden",
    description: BLOOM_THEME_PRESETS.bloom.description,
    palette: {
      accent: "#d9a441",
      background: "#f7f1e6",
      primary: "#7f967e",
      surface: "#fffdf7",
    },
  },
];

const SCREEN_FEATURE_LABELS = {
  camera: "Camera views",
  controls: "Control screens",
  debug: "Debug screens",
  empty: "Blank starters",
  interface: "Interface screens",
} satisfies Record<ScreenFeature, string>;

const SCREEN_FEATURE_COLORS = {
  camera: "var(--bloom-color-mist)",
  controls: "var(--bloom-color-pollen)",
  debug: "var(--bloom-color-lilac)",
  empty: "var(--bloom-color-petal)",
  interface: "var(--bloom-color-sage)",
} satisfies Record<ScreenFeature, string>;

const SCREEN_FEATURE_ORDER: readonly ScreenFeature[] = ["controls", "camera", "debug", "interface", "empty"];

export function screenFeatureLabel(feature: ScreenFeature): string {
  return SCREEN_FEATURE_LABELS[feature];
}

export function createScreenAccentStyle(screen: ScreenConfig): CSSProperties {
  return { "--screen-card-accent": SCREEN_FEATURE_COLORS[resolveScreenFeature(screen)] } as CSSProperties;
}

export function createFeatureAccentStyle(feature: ScreenFeature): CSSProperties {
  return { "--screen-card-accent": SCREEN_FEATURE_COLORS[feature] } as CSSProperties;
}

export function describeScreenFeature(screen: ScreenConfig): string {
  return SCREEN_FEATURE_LABELS[resolveScreenFeature(screen)];
}

export function groupAvailableScreensByFeature(screens: readonly AvailableScreen[]) {
  return SCREEN_FEATURE_ORDER.map((feature) => ({
    feature,
    screens: screens.filter(({ screen }) => resolveScreenFeature(screen) === feature),
  })).filter((group) => group.screens.length > 0);
}

export function collectAvailableScreens(applications: readonly ApplicationConfig[]): AvailableScreen[] {
  const screensById = new Map<string, AvailableScreen>();

  for (const application of applications) {
    for (const screen of application.screens) {
      if (!screensById.has(screen.id)) {
        screensById.set(screen.id, {
          screen,
          sourceApplicationName: application.name,
        });
      }
    }
  }

  return [...screensById.values()];
}

export function createEmptyActionPresetDraft(): RuntimeActionPreset {
  return {
    id: "",
    name: "",
    kind: "topic-publish",
    description: "",
    command: "",
    topic: "",
    message_type: "",
    payload: null,
    payload_text: "",
    tags: [],
  };
}

export function createRuntimePresetFromLibraryPreset(
  preset: RosMessageCommandPreset,
  existingPresets: readonly RuntimeActionPreset[],
): RuntimeActionPreset {
  return {
    id: createUniquePresetId(preset.id, existingPresets),
    name: preset.label,
    kind: "topic-publish",
    description: preset.description,
    command: preset.command,
    topic: preset.topic,
    message_type: preset.messageType,
    payload: null,
    payload_text: preset.payload,
    tags: [preset.category, "library"],
  };
}

export function createUniquePresetId(name: string, presets: readonly RuntimeActionPreset[]): string {
  return createUniqueId(
    name,
    presets.map((preset) => preset.id),
  );
}

export function mergeUniqueRuntimePolicyValues(
  currentValues: readonly string[],
  nextValues: readonly string[],
): string[] {
  return [...new Set([...currentValues, ...nextValues].map((value) => value.trim()).filter(Boolean))];
}

export function formatPresetCategory(category: RosMessageCommandPreset["category"]): string {
  return {
    bridge: "Bridge commands",
    motion: "Motion commands",
    "state-machine": "State machines",
    utility: "Utility commands",
  }[category];
}

export function formatLines(values: readonly string[]): string {
  return values.join("\n");
}

export function parseLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}
