import type {
  CanvasPresetId,
  CanvasSettings,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";
import { getDefaultWidgetSettings, normalizeWidgetSettings } from "./settings";

export * from "./editor";
export * from "./extensions";
export * from "./legacy";
export * from "./runtime";
export * from "./settings";
export * from "./telemetry";

export type LegacyWidgetCompatibility = "direct" | "renamed" | "adapter-required" | "app-specific" | "unsupported";

export type LegacyWidgetKind =
  | "joystick"
  | "slider"
  | "mode-button"
  | "save-pose-button"
  | "load-pose-button"
  | "navigation-button"
  | "navigation-bar"
  | "text"
  | "textarea"
  | "button"
  | "rosbag-control"
  | "max-velocity"
  | "gripper-control"
  | "magnet-control"
  | "toggle-publisher"
  | "ros-message-toggle"
  | "stream-display"
  | "throw-draw"
  | "drink"
  | "curves"
  | "logs";

export type LegacyWidgetKindMapping = {
  legacyKind: string;
  bloomKind: WidgetKind;
  compatibility: LegacyWidgetCompatibility;
  displayName: string;
  notes: string;
};

export type WidgetCategory = "command" | "device" | "display" | "feedback" | "input" | "unknown";

export type WidgetRuntimeRequirement =
  | "none"
  | "command-dispatcher"
  | "data-source"
  | "device-adapter"
  | "stream-source"
  | "teleop-adapter";

export type WidgetAvailability = {
  editor: boolean;
  runtime: boolean;
};

export type WidgetDefaultLayout = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

export type WidgetStyleCapability = "accentColor" | "backgroundColor" | "borderColor" | "textColor";

export type WidgetEditorCapabilities = {
  movable: boolean;
  resizable: boolean;
  settings: boolean;
  styleFields: WidgetStyleCapability[];
};

export type CanvasPreset = {
  id: CanvasPresetId;
  label: string;
  width: number;
  height: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type LegacyWidgetRect = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
};

export const WIDGET_LAYOUT_GRID_SIZE = 8;
export const CANVAS_WIDGET_EDGE_PADDING = 24;

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: "native-1024x600", label: "Native Tablet (1024x600)", width: 1024, height: 600 },
  { id: "hd", label: "HD (1280x720)", width: 1280, height: 720 },
  { id: "tablet", label: "Tablet (1280x800)", width: 1280, height: 800 },
  { id: "full-hd", label: "Full HD (1920x1080)", width: 1920, height: 1080 },
  { id: "local-screen", label: "Local Screen (1920x1080)", width: 1920, height: 1080 },
];

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  preset_id: "hd",
  runtime_mode: "fit",
};

export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  x: 0,
  y: 0,
  width: 160,
  height: 80,
};

export type WidgetRenderContext = {
  screenId: string;
};

export type WidgetRenderDescriptor =
  | {
      status: "resolved";
      widget: WidgetConfig;
      definition: WidgetDefinition;
      context: WidgetRenderContext;
    }
  | {
      status: "unknown";
      widget: WidgetConfig;
      context: WidgetRenderContext;
      reason: string;
    };

export type WidgetDefinition = {
  kind: WidgetKind;
  displayName: string;
  category: WidgetCategory;
  description: string;
  defaultTitle: string;
  defaultSettings: Record<string, unknown>;
  defaultLayout: WidgetDefaultLayout;
  runtimeRequirements: WidgetRuntimeRequirement[];
  availability: WidgetAvailability;
  editor: WidgetEditorCapabilities;
};

export type WidgetRegistry = ReadonlyMap<WidgetKind, WidgetDefinition>;

export function createDefaultEditorCapabilities(styleFields: WidgetStyleCapability[] = []): WidgetEditorCapabilities {
  return {
    movable: true,
    resizable: true,
    settings: true,
    styleFields,
  };
}

export const DEFAULT_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    kind: "button",
    displayName: "Button",
    category: "command",
    description: "Generic button for local UI actions such as navigation or editor workflows.",
    defaultTitle: "Button",
    defaultSettings: getDefaultWidgetSettings("button"),
    defaultLayout: { width: 160, height: 56, minWidth: 120, minHeight: 48 },
    runtimeRequirements: ["none"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "borderColor", "textColor"]),
  },
  {
    kind: "camera",
    displayName: "Camera",
    category: "display",
    description: "Displays a camera, RViz, or visualization stream.",
    defaultTitle: "Camera",
    defaultSettings: getDefaultWidgetSettings("camera"),
    defaultLayout: { width: 360, height: 260, minWidth: 240, minHeight: 160 },
    runtimeRequirements: ["stream-source"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["borderColor"]),
  },
  {
    kind: "command-button",
    displayName: "Command button",
    category: "command",
    description: "Sends a configured command intent through the runtime boundary.",
    defaultTitle: "Command",
    defaultSettings: getDefaultWidgetSettings("command-button"),
    defaultLayout: { width: 160, height: 56, minWidth: 120, minHeight: 48 },
    runtimeRequirements: ["command-dispatcher"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "borderColor", "textColor"]),
  },
  {
    kind: "gauge",
    displayName: "Gauge",
    category: "feedback",
    description: "Displays a scalar value from a runtime data source.",
    defaultTitle: "Gauge",
    defaultSettings: getDefaultWidgetSettings("gauge"),
    defaultLayout: { width: 180, height: 180, minWidth: 140, minHeight: 140 },
    runtimeRequirements: ["data-source"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "textColor"]),
  },
  {
    kind: "joystick",
    displayName: "Joystick",
    category: "input",
    description: "Captures planar operator input for teleoperation-like controls.",
    defaultTitle: "Joystick",
    defaultSettings: getDefaultWidgetSettings("joystick"),
    defaultLayout: { width: 220, height: 220, minWidth: 160, minHeight: 160 },
    runtimeRequirements: ["teleop-adapter"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor"]),
  },
  {
    kind: "label",
    displayName: "Label",
    category: "display",
    description: "Displays static text in a screen.",
    defaultTitle: "Label",
    defaultSettings: getDefaultWidgetSettings("label"),
    defaultLayout: { width: 280, height: 64, minWidth: 120, minHeight: 40 },
    runtimeRequirements: ["none"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "plot",
    displayName: "Plot",
    category: "feedback",
    description: "Displays timeseries or curve data from a runtime data source.",
    defaultTitle: "Plot",
    defaultSettings: getDefaultWidgetSettings("plot"),
    defaultLayout: { width: 420, height: 240, minWidth: 240, minHeight: 160 },
    runtimeRequirements: ["data-source"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "textColor"]),
  },
  {
    kind: "slider",
    displayName: "Slider",
    category: "input",
    description: "Captures scalar operator input.",
    defaultTitle: "Slider",
    defaultSettings: getDefaultWidgetSettings("slider"),
    defaultLayout: { width: 120, height: 220, minWidth: 80, minHeight: 120 },
    runtimeRequirements: ["teleop-adapter"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor"]),
  },
  {
    kind: "toggle",
    displayName: "Toggle",
    category: "device",
    description: "Captures an ON/OFF operator intent.",
    defaultTitle: "Toggle",
    defaultSettings: getDefaultWidgetSettings("toggle"),
    defaultLayout: { width: 220, height: 120, minWidth: 160, minHeight: 80 },
    runtimeRequirements: ["device-adapter"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "borderColor"]),
  },
  {
    kind: "topic-echo",
    displayName: "Topic echo",
    category: "feedback",
    description: "Displays recent messages from a configured runtime topic in a console-like view.",
    defaultTitle: "Topic echo",
    defaultSettings: getDefaultWidgetSettings("topic-echo"),
    defaultLayout: { width: 460, height: 260, minWidth: 280, minHeight: 160 },
    runtimeRequirements: ["data-source"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "topic-plot",
    displayName: "Topic plot",
    category: "feedback",
    description: "Displays scalar or vector topic fields as a lightweight timeseries for debugging.",
    defaultTitle: "Topic plot",
    defaultSettings: getDefaultWidgetSettings("topic-plot"),
    defaultLayout: { width: 480, height: 260, minWidth: 280, minHeight: 180 },
    runtimeRequirements: ["data-source"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "textColor"]),
  },
  {
    kind: "unknown",
    displayName: "Unknown widget",
    category: "unknown",
    description: "Fallback capability used to preserve unsupported widgets safely.",
    defaultTitle: "Unknown widget",
    defaultSettings: getDefaultWidgetSettings("unknown"),
    defaultLayout: { width: 220, height: 120, minWidth: 120, minHeight: 80 },
    runtimeRequirements: ["none"],
    availability: { editor: false, runtime: true },
    editor: {
      movable: false,
      resizable: false,
      settings: false,
      styleFields: [],
    },
  },
];

export const LEGACY_WIDGET_KIND_MAPPINGS: Readonly<Record<LegacyWidgetKind, LegacyWidgetKindMapping>> = {
  joystick: {
    legacyKind: "joystick",
    bloomKind: "joystick",
    compatibility: "direct",
    displayName: "Joystick",
    notes: "The legacy kind already matches the Bloom generic input widget.",
  },
  slider: {
    legacyKind: "slider",
    bloomKind: "slider",
    compatibility: "direct",
    displayName: "Slider",
    notes: "The legacy kind already matches the Bloom generic input widget.",
  },
  "mode-button": {
    legacyKind: "mode-button",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Mode button",
    notes: "Requires a teleoperation adapter before it can trigger runtime mode changes.",
  },
  "save-pose-button": {
    legacyKind: "save-pose-button",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Save pose button",
    notes: "Requires a pose/session adapter before it can persist robot poses.",
  },
  "load-pose-button": {
    legacyKind: "load-pose-button",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Load pose button",
    notes: "Requires a pose/session adapter before it can command saved poses.",
  },
  "navigation-button": {
    legacyKind: "navigation-button",
    bloomKind: "button",
    compatibility: "renamed",
    displayName: "Navigation button",
    notes: "Can become a generic button once screen routing is owned by Bloom.",
  },
  "navigation-bar": {
    legacyKind: "navigation-bar",
    bloomKind: "unknown",
    compatibility: "unsupported",
    displayName: "Navigation bar",
    notes: "Needs a dedicated navigation/layout model before migration.",
  },
  text: {
    legacyKind: "text",
    bloomKind: "label",
    compatibility: "renamed",
    displayName: "Text",
    notes: "Static text maps to Bloom label semantics.",
  },
  textarea: {
    legacyKind: "textarea",
    bloomKind: "label",
    compatibility: "renamed",
    displayName: "Textarea",
    notes: "Multiline static text maps to Bloom label semantics for the first migration pass.",
  },
  button: {
    legacyKind: "button",
    bloomKind: "command-button",
    compatibility: "renamed",
    displayName: "Action button",
    notes: "Legacy buttons publish commands, so they map to Bloom command buttons.",
  },
  "rosbag-control": {
    legacyKind: "rosbag-control",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Rosbag control",
    notes: "Requires a backend recording adapter before it can control rosbag sessions.",
  },
  "max-velocity": {
    legacyKind: "max-velocity",
    bloomKind: "slider",
    compatibility: "adapter-required",
    displayName: "Max velocity",
    notes: "Uses slider semantics but requires a teleoperation settings adapter.",
  },
  "gripper-control": {
    legacyKind: "gripper-control",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "Gripper control",
    notes: "Requires a device adapter before it can publish gripper commands.",
  },
  "magnet-control": {
    legacyKind: "magnet-control",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "Magnet control",
    notes: "Requires a device adapter before it can publish magnet commands.",
  },
  "toggle-publisher": {
    legacyKind: "toggle-publisher",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "Toggle publisher",
    notes: "Requires a publisher adapter before it can emit configured ON/OFF payloads.",
  },
  "ros-message-toggle": {
    legacyKind: "ros-message-toggle",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "ROS message toggle",
    notes: "Requires typed ROS message publishing before it can emit structured ON/OFF payloads.",
  },
  "stream-display": {
    legacyKind: "stream-display",
    bloomKind: "camera",
    compatibility: "renamed",
    displayName: "Stream display",
    notes: "Maps to Bloom camera/stream display semantics for the first migration pass.",
  },
  "throw-draw": {
    legacyKind: "throw-draw",
    bloomKind: "unknown",
    compatibility: "adapter-required",
    displayName: "Gesture draw",
    notes: "Reusable gesture/trajectory input candidate; keep as unknown until Bloom has a generic draw-control model.",
  },
  drink: {
    legacyKind: "drink",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Media action button",
    notes:
      "Reusable media/action overlay candidate; migrate later as a generic widget instead of a Petanque-only widget.",
  },
  curves: {
    legacyKind: "curves",
    bloomKind: "plot",
    compatibility: "renamed",
    displayName: "Curves",
    notes: "Maps to Bloom plot semantics.",
  },
  logs: {
    legacyKind: "logs",
    bloomKind: "unknown",
    compatibility: "adapter-required",
    displayName: "Logs",
    notes: "Reusable logging/event viewer candidate; needs a generic log stream model before migration.",
  },
};

export function createWidgetRegistry(definitions: Iterable<WidgetDefinition> = []): WidgetRegistry {
  const registry = new Map<WidgetKind, WidgetDefinition>();

  for (const definition of definitions) {
    if (registry.has(definition.kind)) {
      throw new Error(`Duplicate widget definition for kind "${definition.kind}".`);
    }
    registry.set(definition.kind, definition);
  }

  return registry;
}

export function createDefaultWidgetRegistry(): WidgetRegistry {
  return createWidgetRegistry(DEFAULT_WIDGET_DEFINITIONS);
}

export function listWidgetDefinitionsByCategory(
  registry: WidgetRegistry,
  category: WidgetCategory,
): WidgetDefinition[] {
  return [...registry.values()].filter((definition) => definition.category === category);
}

export function snapLayoutValue(value: number, gridSize: number = WIDGET_LAYOUT_GRID_SIZE): number {
  if (gridSize <= 0) {
    return value;
  }
  return Math.round(value / gridSize) * gridSize;
}

export function getCanvasPreset(presetId: CanvasPresetId): CanvasPreset {
  return CANVAS_PRESETS.find((preset) => preset.id === presetId) ?? CANVAS_PRESETS[0];
}

export function resolveCanvasPresetSize(settings: CanvasSettings): ViewportSize {
  const preset = getCanvasPreset(settings.preset_id);
  return {
    width: preset.width,
    height: preset.height,
  };
}

export function resolveCanvasArtboardSize(widgets: readonly WidgetConfig[], settings: CanvasSettings): ViewportSize {
  const presetSize = resolveCanvasPresetSize(settings);
  const maxRight = widgets.reduce((right, widget) => Math.max(right, widget.layout.x + widget.layout.width), 0);
  const maxBottom = widgets.reduce((bottom, widget) => Math.max(bottom, widget.layout.y + widget.layout.height), 0);

  return {
    width: Math.max(presetSize.width, maxRight + CANVAS_WIDGET_EDGE_PADDING),
    height: Math.max(presetSize.height, maxBottom + CANVAS_WIDGET_EDGE_PADDING),
  };
}

export function resolveCanvasFitScale(
  settings: CanvasSettings,
  canvasSize: ViewportSize,
  viewportSize: ViewportSize,
): number {
  if (settings.runtime_mode !== "fit") {
    return 1;
  }
  if (canvasSize.width <= 0 || canvasSize.height <= 0) {
    return 1;
  }
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return 1;
  }
  return Math.min(viewportSize.width / canvasSize.width, viewportSize.height / canvasSize.height);
}

export function legacyRectToLayout(rect: LegacyWidgetRect | null | undefined): WidgetLayout {
  if (!rect) {
    return { ...DEFAULT_WIDGET_LAYOUT };
  }
  return {
    x: rect.x ?? DEFAULT_WIDGET_LAYOUT.x,
    y: rect.y ?? DEFAULT_WIDGET_LAYOUT.y,
    width: rect.w ?? rect.width ?? DEFAULT_WIDGET_LAYOUT.width,
    height: rect.h ?? rect.height ?? DEFAULT_WIDGET_LAYOUT.height,
  };
}

export function createWidgetConfigFromDefinition(
  definition: WidgetDefinition,
  id: string,
  overrides: Partial<Pick<WidgetConfig, "layout" | "settings" | "title">> = {},
): WidgetConfig {
  const normalizedSettings = normalizeWidgetSettings(definition.kind, overrides.settings ?? {});
  if (!normalizedSettings.success) {
    throw new Error(
      `Invalid settings for widget kind "${definition.kind}": ${normalizedSettings.errors
        .map((error) => `${error.field}: ${error.message}`)
        .join("; ")}`,
    );
  }

  return {
    id,
    kind: definition.kind,
    title: overrides.title ?? definition.defaultTitle,
    layout: overrides.layout ?? {
      x: 0,
      y: 0,
      width: definition.defaultLayout.width,
      height: definition.defaultLayout.height,
    },
    settings: normalizedSettings.settings,
  };
}

export function resolveLegacyWidgetKind(kind: string): LegacyWidgetKindMapping {
  return (
    LEGACY_WIDGET_KIND_MAPPINGS[kind as LegacyWidgetKind] ?? {
      legacyKind: kind,
      bloomKind: "unknown",
      compatibility: "unsupported",
      displayName: kind,
      notes: `No legacy widget mapping is registered for kind "${kind}".`,
    }
  );
}

export function toBloomWidgetKind(kind: string): WidgetKind {
  return resolveLegacyWidgetKind(kind).bloomKind;
}

export function renderWidgetDescriptor(
  widget: WidgetConfig,
  registry: WidgetRegistry,
  context: WidgetRenderContext,
): WidgetRenderDescriptor {
  const definition = registry.get(widget.kind);
  if (!definition) {
    return {
      status: "unknown",
      widget,
      context,
      reason: `No widget definition registered for kind "${widget.kind}".`,
    };
  }

  return {
    status: "resolved",
    widget,
    definition,
    context,
  };
}

export function renderScreenDescriptors(screen: ScreenConfig, registry: WidgetRegistry): WidgetRenderDescriptor[] {
  return screen.widgets.map((widget) =>
    renderWidgetDescriptor(widget, registry, {
      screenId: screen.id,
    }),
  );
}
