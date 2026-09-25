import type { WidgetKind } from "@bloom/api-client";
import { gripperToggleSettings } from "./gripper";
import { PALETTE_WIRING } from "./palette-wiring";
import { translationPadSettings } from "./robot-axes";
import { getDefaultWidgetSettings } from "./settings";
import type {
  WidgetDefinition,
  WidgetEditorCapabilities,
  WidgetRegistry,
  WidgetStyleCapability,
} from "./widget-definition";

/** Every widget kind Bloom ships, and the registry the runtime and the builder read them from. */
function createDefaultEditorCapabilities(styleFields: WidgetStyleCapability[] = []): WidgetEditorCapabilities {
  return {
    movable: true,
    resizable: true,
    settings: true,
    styleFields,
  };
}

/** The contract's defaults with the palette's wiring on top, so a placed widget already works. */
function wired(kind: WidgetKind): Record<string, unknown> {
  return { ...getDefaultWidgetSettings(kind), ...(PALETTE_WIRING[kind]?.settings ?? {}) };
}

export const DEFAULT_WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    kind: "camera",
    displayName: "Camera",
    category: "display",
    description: "Shows a browser webcam, a stream URL, or a ROS compressed image topic such as a gripper camera.",
    defaultTitle: "Camera",
    defaultSettings: wired("camera"),
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
    defaultTitle: PALETTE_WIRING["command-button"]?.title ?? "",
    defaultSettings: wired("command-button"),
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
    defaultTitle: PALETTE_WIRING["event-log"]?.title ?? "",
    defaultSettings: wired("event-log"),
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
    defaultTitle: PALETTE_WIRING["gauge"]?.title ?? "",
    defaultSettings: wired("gauge"),
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
    defaultSettings: wired("gesture-pad"),
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
    defaultTitle: "Translation",
    defaultSettings: translationPadSettings(),
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
    defaultSettings: wired("label"),
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
    defaultTitle: PALETTE_WIRING["plot"]?.title ?? "",
    defaultSettings: wired("plot"),
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
    defaultSettings: wired("position-library"),
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
    description: "The running robot from its own description, its joints live, with rviz-style markers.",
    defaultTitle: "3D robot",
    defaultSettings: getDefaultWidgetSettings("robot-3d"),
    defaultLayout: { width: 460, height: 320, minWidth: 280, minHeight: 220 },
    runtimeRequirements: ["data-source"],
    maturity: "ready",
    maturityNote:
      "Draws the URDF the API serves, driven by joint states; a MarkerArray topic draws as rviz would, a joint target as a translucent twin, a pose as a triad. Desktop screens only.",
    deviceClasses: ["desktop"],
    availability: { editor: true, runtime: true },
    editor: createDefaultEditorCapabilities(["backgroundColor", "borderColor"]),
  },
  {
    kind: "slider",
    displayName: "Slider",
    category: "input",
    description: "Captures scalar operator input.",
    defaultTitle: PALETTE_WIRING["slider"]?.title ?? "",
    defaultSettings: wired("slider"),
    // Horizontal, as its wiring sets it: the speed limit reads left to right.
    defaultLayout: { width: 340, height: 132, minWidth: 260, minHeight: 104 },
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
    defaultTitle: PALETTE_WIRING["topic-echo"]?.title ?? "",
    defaultSettings: wired("topic-echo"),
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
    defaultSettings: wired("joint-table"),
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
    defaultSettings: wired("jacobian"),
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
    defaultTitle: PALETTE_WIRING["plot-board"]?.title ?? "",
    defaultSettings: wired("plot-board"),
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
    defaultSettings: wired("plot-picker"),
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
    defaultTitle: PALETTE_WIRING["value-strip"]?.title ?? "",
    defaultSettings: wired("value-strip"),
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
    defaultTitle: PALETTE_WIRING["topic-plot"]?.title ?? "",
    defaultSettings: wired("topic-plot"),
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
    defaultSettings: wired("unknown"),
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
