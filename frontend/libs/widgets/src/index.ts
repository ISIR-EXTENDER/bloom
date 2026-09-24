import type {
  CanvasPresetId,
  CanvasSettings,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";
import { gripperToggleSettings } from "./gripper";
import { getDefaultWidgetSettings } from "./settings";

export * from "./canvas-defaults";
export * from "./cli-preview";
export * from "./control-geometry";
export * from "./debug-readings";
export * from "./editor";
export * from "./gripper";
export * from "./layout-grid";
export { legacyCanvasScreensToApplicationConfig } from "./legacy";
export * from "./min-size";
export * from "./numbers";
export * from "./operator-glossary";
export * from "./pad-geometry";
export * from "./plot-series";
export * from "./runtime";
export * from "./settings";
export * from "./telemetry";
export * from "./values";
export * from "./widget-destination";
export * from "./widget-readiness";

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
  | "logs"
  | "momentary-ros-message"
  | "topic-monitor";

export type LegacyWidgetKindMapping = {
  legacyKind: string;
  bloomKind: WidgetKind;
  compatibility: LegacyWidgetCompatibility;
  displayName: string;
  notes: string;
};

export type WidgetCategory = "command" | "device" | "display" | "feedback" | "input" | "unknown";

/**
 * A backend seam a widget needs before it can do anything.
 *
 * These are the seams the backend actually reports at
 * `GET /api/v1/capabilities`, and nothing else. The list used to include
 * `device-adapter`, `robot-model-source` and `stream-source`, which no code
 * implemented and nothing consumed, so widgets declared needs that could never
 * be met or checked. A requirement that cannot be resolved is worse than none:
 * it reads like a promise.
 */
export type WidgetRuntimeRequirement =
  | "none"
  | "command-dispatcher"
  | "data-source"
  | "service-dispatcher"
  | "teleop-adapter";

/**
 * How finished a widget is, independent of whether the backend can serve it.
 *
 * `ready` does what its description says. `preview` renders and is safe to
 * place, but does less than the name suggests -- the 3D robot view draws a
 * joint summary rather than a model. Saying so in the builder is cheaper than
 * a researcher discovering it mid-session.
 */
export type WidgetMaturity = "preview" | "ready";

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

const CANVAS_WIDGET_EDGE_PADDING = 24;

const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: "native-1024x600", label: "Native Tablet (1024x600)", width: 1024, height: 600 },
  { id: "native-1280x720", label: "Native Operator Panel (1280x720)", width: 1280, height: 720 },
  { id: "hd", label: "HD (1280x720)", width: 1280, height: 720 },
  { id: "tablet", label: "Tablet (1280x800)", width: 1280, height: 800 },
  { id: "wide-tablet", label: "Wide Tablet Runtime (1820x720)", width: 1820, height: 720 },
  { id: "full-hd", label: "Full HD (1920x1080)", width: 1920, height: 1080 },
  { id: "local-screen", label: "Local Screen (1920x1080)", width: 1920, height: 1080 },
];

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
  maturity: WidgetMaturity;
  /** Set when maturity is `preview`: what it does not do yet. */
  maturityNote?: string;
  availability: WidgetAvailability;
  editor: WidgetEditorCapabilities;
};

export type WidgetRegistry = ReadonlyMap<WidgetKind, WidgetDefinition>;

function createDefaultEditorCapabilities(styleFields: WidgetStyleCapability[] = []): WidgetEditorCapabilities {
  return {
    movable: true,
    resizable: true,
    settings: true,
    styleFields,
  };
}

export const DEFAULT_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    kind: "camera",
    displayName: "Camera",
    category: "display",
    description: "Shows a browser webcam, a stream URL, or a ROS compressed image topic such as a gripper camera.",
    defaultTitle: "Camera",
    defaultSettings: getDefaultWidgetSettings("camera"),
    defaultLayout: { width: 360, height: 260, minWidth: 240, minHeight: 160 },
    // Webcam and stream URL need no backend, so the widget stays available without one; the
    // ROS source says for itself when no node is attached.
    runtimeRequirements: ["none"],
    maturity: "ready",
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
    defaultLayout: { width: 160, height: 104, minWidth: 140, minHeight: 104 },
    runtimeRequirements: ["command-dispatcher"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "borderColor", "textColor"]),
  },
  {
    kind: "event-log",
    displayName: "Event log",
    category: "feedback",
    description: "Displays operator-friendly runtime events with severity and optional details.",
    defaultTitle: "Event log",
    defaultSettings: getDefaultWidgetSettings("event-log"),
    defaultLayout: { width: 520, height: 280, minWidth: 300, minHeight: 200 },
    runtimeRequirements: ["data-source"],
    maturity: "preview",
    maturityNote: "Shows raw messages from one topic; it does not group or filter by severity yet.",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "gauge",
    displayName: "Gauge",
    category: "feedback",
    description: "Displays a scalar value from a runtime data source.",
    defaultTitle: "Gauge",
    defaultSettings: getDefaultWidgetSettings("gauge"),
    defaultLayout: { width: 280, height: 180, minWidth: 280, minHeight: 180 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "textColor"]),
  },
  {
    kind: "gesture-pad",
    displayName: "Gesture pad",
    category: "input",
    description: "Captures an angle and power gesture for trajectory-like commands.",
    defaultTitle: "Gesture",
    defaultSettings: getDefaultWidgetSettings("gesture-pad"),
    defaultLayout: { width: 360, height: 280, minWidth: 260, minHeight: 220 },
    runtimeRequirements: ["command-dispatcher"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "borderColor"]),
  },
  {
    kind: "joystick",
    displayName: "Joystick",
    category: "input",
    description: "Captures planar operator input for teleoperation-like controls.",
    defaultTitle: "Joystick",
    defaultSettings: getDefaultWidgetSettings("joystick"),
    defaultLayout: { width: 280, height: 332, minWidth: 280, minHeight: 332 },
    runtimeRequirements: ["teleop-adapter"],
    maturity: "ready",
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
    maturity: "ready",
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
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor", "textColor"]),
  },
  {
    kind: "position-library",
    displayName: "Position library",
    category: "command",
    description: "Capture the robot's pose, keep a named list, and export it for the manager's joint targets.",
    defaultTitle: "Positions",
    defaultSettings: getDefaultWidgetSettings("position-library"),
    defaultLayout: { width: 460, height: 380, minWidth: 420, minHeight: 300 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor"]),
  },
  {
    kind: "robot-3d",
    displayName: "3D robot view",
    category: "display",
    description: "Optional robot model visualization for URDF/joint-state extensions.",
    defaultTitle: "3D robot",
    defaultSettings: getDefaultWidgetSettings("robot-3d"),
    defaultLayout: { width: 460, height: 320, minWidth: 280, minHeight: 220 },
    runtimeRequirements: ["data-source"],
    maturity: "preview",
    maturityNote: "Shows a joint-state summary, not a 3D model. The model URL is not loaded yet.",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "borderColor"]),
  },
  {
    kind: "slider",
    displayName: "Slider",
    category: "input",
    description: "Captures scalar operator input.",
    defaultTitle: "Slider",
    defaultSettings: getDefaultWidgetSettings("slider"),
    defaultLayout: { width: 120, height: 284, minWidth: 104, minHeight: 284 },
    runtimeRequirements: ["teleop-adapter"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["accentColor", "backgroundColor"]),
  },
  {
    kind: "toggle",
    displayName: "Toggle",
    category: "device",
    // Placed wired to the gripper: the control this toggle is nearly always used for, and the one the
    // command architecture defines end to end. Repointing the topic makes it an ordinary toggle again.
    description: "An ON/OFF command. Arrives wired to the gripper; change the topic to drive something else.",
    defaultTitle: "Gripper",
    defaultSettings: gripperToggleSettings(),
    defaultLayout: { width: 220, height: 120, minWidth: 200, minHeight: 120 },
    runtimeRequirements: ["command-dispatcher"],
    maturity: "ready",
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
    defaultLayout: { width: 460, height: 280, minWidth: 226, minHeight: 200 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "joint-table",
    displayName: "Joint table",
    category: "feedback",
    description: "Lists each joint's position, velocity, effort and how close it is to a configured limit.",
    defaultTitle: "Joint states",
    defaultSettings: getDefaultWidgetSettings("joint-table"),
    defaultLayout: { width: 724, height: 440, minWidth: 480, minHeight: 280 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "jacobian",
    displayName: "Jacobian",
    category: "feedback",
    description: "Shows the end-effector Jacobian as a matrix with its manipulability.",
    defaultTitle: "Jacobian",
    defaultSettings: getDefaultWidgetSettings("jacobian"),
    defaultLayout: { width: 724, height: 440, minWidth: 480, minHeight: 360 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "plot-board",
    displayName: "Plot board",
    category: "feedback",
    description: "Plots several topic fields over one shared time axis, with a picker beside it as the legend.",
    defaultTitle: "Plot board",
    defaultSettings: getDefaultWidgetSettings("plot-board"),
    defaultLayout: { width: 902, height: 400, minWidth: 480, minHeight: 280 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "plot-picker",
    displayName: "Plot picker",
    category: "feedback",
    description: "Chooses which series a plot board draws and doubles as its legend.",
    defaultTitle: "Series",
    defaultSettings: getDefaultWidgetSettings("plot-picker"),
    defaultLayout: { width: 338, height: 348, minWidth: 260, minHeight: 200 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "textColor"]),
  },
  {
    kind: "value-strip",
    displayName: "Value strip",
    category: "feedback",
    description: "Shows the latest value of several topic fields as large numbers.",
    defaultTitle: "Current values",
    defaultSettings: getDefaultWidgetSettings("value-strip"),
    defaultLayout: { width: 902, height: 200, minWidth: 440, minHeight: 140 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
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
    maturity: "ready",
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
    maturity: "ready",
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
    bloomKind: "command-button",
    compatibility: "renamed",
    displayName: "Navigation button",
    notes: "A command button that navigates to its target screen.",
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
  "momentary-ros-message": {
    legacyKind: "momentary-ros-message",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Momentary ROS message",
    notes: "Maps to a momentary Bloom command button that publishes pressed and released payloads.",
  },
  "topic-monitor": {
    legacyKind: "topic-monitor",
    bloomKind: "topic-echo",
    compatibility: "renamed",
    displayName: "Topic monitor",
    notes: "Maps to topic echo semantics for live diagnostic topic snapshots.",
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
    bloomKind: "gesture-pad",
    compatibility: "renamed",
    displayName: "Gesture draw",
    notes: "Maps to Bloom gesture-pad semantics for angle/power trajectory-like commands.",
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
    bloomKind: "event-log",
    compatibility: "renamed",
    displayName: "Logs",
    notes: "Legacy logs map to Bloom's generic event log for operator-readable events.",
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

function getCanvasPreset(presetId: CanvasPresetId): CanvasPreset {
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
  if (settings.runtime_mode !== "fit" && settings.runtime_mode !== "operator-fit") {
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
