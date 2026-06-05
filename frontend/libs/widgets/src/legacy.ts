import type {
  ApplicationConfig,
  CanvasSettings,
  ConfigurationBundle,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";
import { DEFAULT_APPLICATION_THEME } from "@bloom/api-client";

export type LegacyCanvasScreen = {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  canvas?: Record<string, unknown>;
  widgets?: LegacyCanvasWidget[];
};

export type LegacyApplication = {
  description?: string;
  homeScreenId?: string;
  id?: string;
  name?: string;
  screenIds?: string[];
};

export type LegacyCanvasWidget = {
  id: string;
  kind?: string;
  label?: string;
  title?: string;
  rect?: Record<string, unknown>;
  [key: string]: unknown;
};

export type LegacyConfigurationBundleOptions = {
  application?: LegacyApplication;
  exportedAt?: string;
  source?: string;
};

const WIDGET_CONFIG_KEYS = new Set(["id", "kind", "label", "rect", "title"]);
const DEFAULT_LEGACY_CANVAS_SETTINGS: CanvasSettings = {
  preset_id: "hd",
  runtime_mode: "fit",
};
const DEFAULT_LEGACY_WIDGET_LAYOUT: WidgetLayout = {
  x: 0,
  y: 0,
  width: 160,
  height: 80,
};

export function legacyCanvasScreenToConfig(screen: LegacyCanvasScreen): ScreenConfig {
  const id = stringOrFallback(screen.id, stringOrFallback(screen.name, "legacy-screen"));
  const title = stringOrFallback(screen.title, stringOrFallback(screen.label, stringOrFallback(screen.name, id)));

  return {
    id,
    title,
    canvas: legacyCanvasSettingsToConfig(screen.canvas),
    widgets: (screen.widgets ?? []).map(legacyCanvasWidgetToConfig),
  };
}

export function legacyCanvasScreensToApplicationConfig(
  screens: readonly LegacyCanvasScreen[],
  application: LegacyApplication = {},
): ApplicationConfig {
  const convertedScreens = screens.map(legacyCanvasScreenToConfig);
  const orderedScreens = orderScreensByLegacyApplication(convertedScreens, application.screenIds);
  const id = stringOrFallback(application.id, "legacy-application");
  const homeScreenDescription = application.homeScreenId ? `Home screen: ${application.homeScreenId}` : "";

  return {
    id,
    name: stringOrFallback(application.name, id),
    description: stringOrFallback(application.description, homeScreenDescription),
    theme: DEFAULT_APPLICATION_THEME,
    profiles: [],
    screens: orderedScreens,
  };
}

export function legacyCanvasScreensToConfigurationBundle(
  screens: readonly LegacyCanvasScreen[],
  options: LegacyConfigurationBundleOptions = {},
): ConfigurationBundle {
  return {
    metadata: {
      schema_version: 1,
      exported_at: options.exportedAt ?? new Date(0).toISOString(),
      source: options.source ?? "extender_ui_legacy",
    },
    applications: [legacyCanvasScreensToApplicationConfig(screens, options.application)],
  };
}

export function legacyCanvasWidgetToConfig(widget: LegacyCanvasWidget): WidgetConfig {
  return {
    id: widget.id,
    kind: legacyKindToBloomKind(stringOrFallback(widget.kind, "unknown")),
    title: stringOrFallback(widget.title, stringOrFallback(widget.label, widget.id)),
    layout: legacyRectToLayout(widget.rect),
    settings: legacyWidgetSettingsToConfig(widget),
  };
}

export function legacyCanvasSettingsToConfig(canvas: Record<string, unknown> | undefined): CanvasSettings {
  if (!canvas) {
    return { ...DEFAULT_LEGACY_CANVAS_SETTINGS };
  }
  return {
    preset_id: isCanvasPresetId(canvas.presetId) ? canvas.presetId : DEFAULT_LEGACY_CANVAS_SETTINGS.preset_id,
    runtime_mode: isRuntimeCanvasMode(canvas.runtimeMode)
      ? canvas.runtimeMode
      : DEFAULT_LEGACY_CANVAS_SETTINGS.runtime_mode,
  };
}

function orderScreensByLegacyApplication(
  screens: readonly ScreenConfig[],
  screenIds: string[] | undefined,
): ScreenConfig[] {
  if (!screenIds || screenIds.length === 0) {
    return [...screens];
  }

  const screensById = new Map(screens.map((screen) => [screen.id, screen]));
  const orderedScreens = screenIds.flatMap((screenId) => {
    const screen = screensById.get(screenId);
    return screen ? [screen] : [];
  });
  const remainingScreens = screens.filter((screen) => !screenIds.includes(screen.id));
  return [...orderedScreens, ...remainingScreens];
}

function legacyKindToBloomKind(kind: string): WidgetKind {
  const mapping: Record<string, WidgetKind> = {
    button: "command-button",
    camera: "camera",
    curves: "plot",
    drink: "command-button",
    "gripper-control": "toggle",
    joystick: "joystick",
    "load-pose-button": "command-button",
    "magnet-control": "toggle",
    "max-velocity": "slider",
    "mode-button": "command-button",
    "navigation-button": "button",
    plot: "plot",
    "ros-message-toggle": "toggle",
    "rosbag-control": "command-button",
    "save-pose-button": "command-button",
    slider: "slider",
    "stream-display": "camera",
    text: "label",
    textarea: "label",
    "throw-draw": "gesture-pad",
    toggle: "toggle",
    "toggle-publisher": "toggle",
  };
  return mapping[kind] ?? "unknown";
}

function legacyRectToLayout(rect: Record<string, unknown> | undefined): WidgetLayout {
  if (!rect) {
    return { ...DEFAULT_LEGACY_WIDGET_LAYOUT };
  }
  return {
    x: numberOrFallback(rect.x, DEFAULT_LEGACY_WIDGET_LAYOUT.x),
    y: numberOrFallback(rect.y, DEFAULT_LEGACY_WIDGET_LAYOUT.y),
    width: numberOrFallback(rect.w ?? rect.width, DEFAULT_LEGACY_WIDGET_LAYOUT.width),
    height: numberOrFallback(rect.h ?? rect.height, DEFAULT_LEGACY_WIDGET_LAYOUT.height),
  };
}

function legacyWidgetSettingsToConfig(widget: LegacyCanvasWidget): Record<string, unknown> {
  return {
    ...Object.fromEntries(Object.entries(widget).filter(([key]) => !WIDGET_CONFIG_KEYS.has(key))),
    legacyKind: stringOrFallback(widget.kind, "unknown"),
  };
}

function isCanvasPresetId(value: unknown): value is CanvasSettings["preset_id"] {
  return (
    value === "native-1024x600" ||
    value === "hd" ||
    value === "tablet" ||
    value === "full-hd" ||
    value === "local-screen"
  );
}

function isRuntimeCanvasMode(value: unknown): value is CanvasSettings["runtime_mode"] {
  return value === "left" || value === "center" || value === "fit";
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
