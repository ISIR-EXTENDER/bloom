import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import type { CSSProperties } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";

export type BuilderApplicationItem = {
  application: ApplicationConfig;
  configuration: LoadedConfiguration;
};

export type BuilderHomeSection = "overview" | "apps" | "playground" | "screens";

export type ScreenLibraryType = "camera" | "control" | "debug" | "device" | "workflow" | "general";

export type ScreenLibraryItem = {
  application: ApplicationConfig;
  configuration: LoadedConfiguration;
  displayTitle: string;
  screen: ScreenConfig;
  type: ScreenLibraryType;
};

export const SCREEN_LIBRARY_GROUPS: readonly {
  description: string;
  label: string;
  type: ScreenLibraryType;
}[] = [
  {
    type: "camera",
    label: "Camera views",
    description: "Video, webcam, and stream inspection screens.",
  },
  {
    type: "control",
    label: "Control screens",
    description: "Teleoperation, joystick, slider, and command-oriented screens.",
  },
  {
    type: "debug",
    label: "Debug monitors",
    description: "Topic echoes, plots, logs, and diagnostics screens.",
  },
  {
    type: "device",
    label: "Device panels",
    description: "Reusable controls for grippers, pumps, magnets, sensors, and devices.",
  },
  {
    type: "workflow",
    label: "Workflow screens",
    description: "App-specific steps, state flows, and configuration screens.",
  },
  {
    type: "general",
    label: "General screens",
    description: "Reusable layouts that do not belong to a specialized family yet.",
  },
];

export const SCREEN_LIBRARY_TYPE_LABELS: Record<ScreenLibraryType, string> = {
  camera: "Camera",
  control: "Control",
  debug: "Debug",
  device: "Device",
  workflow: "Workflow",
  general: "General",
};

const SCREEN_TITLE_ACRONYMS: Record<string, string> = {
  api: "API",
  hd: "HD",
  ros: "ROS",
  ui: "UI",
};

export function createBuilderApplicationItems(
  configurations: readonly LoadedConfiguration[],
): BuilderApplicationItem[] {
  return configurations.flatMap((configuration) =>
    configuration.bundle.applications.map((application) => ({ application, configuration })),
  );
}

export function createScreenLibraryItems(applications: readonly BuilderApplicationItem[]): ScreenLibraryItem[] {
  return applications.flatMap(({ application, configuration }) =>
    application.screens.map((screen) => ({
      application,
      configuration,
      displayTitle: formatScreenTitle(screen.title || screen.id),
      screen,
      type: classifyScreen(screen),
    })),
  );
}

export function groupScreensByType(screens: readonly ScreenLibraryItem[]) {
  return SCREEN_LIBRARY_GROUPS.map((definition) => ({
    definition,
    items: screens.filter((screen) => screen.type === definition.type),
  })).filter((group) => group.items.length > 0);
}

export function filterScreens(screens: readonly ScreenLibraryItem[], search: string): ScreenLibraryItem[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return [...screens];
  }

  return screens.filter(({ application, configuration, displayTitle, screen, type }) => {
    const searchableText = [
      application.name,
      configuration.id,
      displayTitle,
      SCREEN_LIBRARY_TYPE_LABELS[type],
      screen.id,
      screen.title,
      ...screen.widgets.map((widget) => widget.kind),
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedSearch);
  });
}

export function selectPlaygroundScreens(screens: readonly ScreenLibraryItem[]): ScreenLibraryItem[] {
  const preferredTypes: readonly ScreenLibraryType[] = ["camera", "debug", "control"];
  const selectedScreens: ScreenLibraryItem[] = [];

  for (const type of preferredTypes) {
    const candidate = screens.find((screen) => screen.type === type);
    if (candidate) {
      selectedScreens.push(candidate);
    }
  }

  return selectedScreens.length > 0 ? selectedScreens : screens.slice(0, 3);
}

export function classifyScreen(screen: ScreenConfig): ScreenLibraryType {
  const screenText = `${screen.id} ${screen.title}`.toLowerCase();
  const widgetKinds = new Set(screen.widgets.map((widget) => widget.kind));

  if (widgetKinds.has("camera") || includesAny(screenText, ["camera", "stream", "video", "webcam"])) {
    return "camera";
  }

  if (
    widgetKinds.has("joystick") ||
    widgetKinds.has("slider") ||
    widgetKinds.has("button") ||
    widgetKinds.has("command-button") ||
    widgetKinds.has("toggle") ||
    includesAny(screenText, ["control", "drive", "teleop", "command"])
  ) {
    return "control";
  }

  if (
    widgetKinds.has("gauge") ||
    widgetKinds.has("plot") ||
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

export function createNewApplicationName(applications: readonly ApplicationConfig[]): string {
  const baseName = "New Bloom App";
  if (!applications.some((application) => application.name === baseName)) {
    return baseName;
  }

  let suffix = 2;
  while (applications.some((application) => application.name === `${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "bloom-app"
  );
}

export function formatScreenTitle(title: string): string {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return "Untitled Screen";
  }

  return normalizedTitle
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => SCREEN_TITLE_ACRONYMS[word.toLowerCase()] ?? capitalize(word))
    .join(" ");
}

export function createPreviewWidgetStyle(
  layout: ScreenConfig["widgets"][number]["layout"],
  screen: ScreenConfig,
): CSSProperties {
  const bounds = resolveScreenPreviewBounds(screen);

  return {
    height: `${Math.max(10, (layout.height / bounds.height) * 100)}%`,
    left: `${(layout.x / bounds.width) * 100}%`,
    top: `${(layout.y / bounds.height) * 100}%`,
    width: `${Math.max(10, (layout.width / bounds.width) * 100)}%`,
  };
}

function resolveScreenPreviewBounds(screen: ScreenConfig): { height: number; width: number } {
  if (screen.canvas.preset_id === "tablet") {
    return { height: 800, width: 1280 };
  }

  return { height: 1080, width: 1920 };
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}
