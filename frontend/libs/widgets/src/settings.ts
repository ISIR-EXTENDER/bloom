import type { WidgetKind } from "@bloom/api-client";

export const MAX_JOYSTICK_PUBLISH_RATE_HZ = 30;

export type WidgetSettingFieldType = "boolean" | "json" | "number" | "select" | "text";

export type WidgetSettingField = {
  key: string;
  label: string;
  type: WidgetSettingFieldType;
  required: boolean;
  options?: string[];
};

export type WidgetSettingsContract<TSettings extends Record<string, unknown> = Record<string, unknown>> = {
  kind: WidgetKind;
  fields: WidgetSettingField[];
  defaultSettings: TSettings;
  validate: (settings: Record<string, unknown>) => WidgetSettingsValidationResult<TSettings>;
};

export type WidgetSettingsValidationError = {
  field: string;
  message: string;
};

export type WidgetSettingsValidationResult<TSettings extends Record<string, unknown> = Record<string, unknown>> =
  | {
      success: true;
      settings: TSettings;
    }
  | {
      success: false;
      errors: WidgetSettingsValidationError[];
    };

export type ButtonSettings = Record<string, never>;

export type CameraSettings = {
  fitMode: "contain" | "cover";
  showHeader: boolean;
  showStatus: boolean;
  source: "placeholder" | "ros-topic" | "stream-url" | "webcam";
  streamUrl: string;
  /** The compressed image topic, read only when source is `ros-topic`. */
  topic: string;
  webcamPicker: boolean;
};

export type CommandActionFeedbackMode = "none" | "progress" | "result";

export type TeleopFrameRuntimeBinding = {
  adapter: "teleop-frame";
  frame_id: string;
};

export type CommandButtonSettings = {
  action_feedback: CommandActionFeedbackMode;
  action_id: string;
  action_label: string;
  button_label: string;
  cancellable: boolean;
  command: string;
  /**
   * Require a second press before the action is dispatched.
   *
   * Meant for commands that move the robot with no way to interrupt them, such
   * as a `cartesian_manager` named joint target: the manager dispatches the
   * pose once and reports no progress, so an accidental press is a moving arm.
   */
  confirm_press?: boolean;
  /** Label shown while the button is armed and waiting for the second press. */
  confirm_label?: string;
  /** Seconds before an armed button disarms itself. 0 keeps it armed. */
  confirm_timeout_seconds?: number;
  messageType?: string;
  payload?: unknown;
  presetId?: string;
  runtime_binding?: TeleopFrameRuntimeBinding;
  topic?: string;
};

export type EventLogSettings = {
  entries: unknown[];
  fieldPath: string;
  maxEntries: number;
  messageType: string;
  severityFilter: string[];
  show_details: boolean;
  showTimestamps: boolean;
  topic: string;
};

export type GaugeSettings = {
  fieldPath: string;
  max: number;
  messageType: string;
  min: number;
  show_details: boolean;
  topic: string;
  unit: string;
  value: number;
};

export type GesturePadSettings = {
  angleLabel: string;
  command: string;
  messageType?: string;
  powerLabel: string;
  show_details: boolean;
  topic?: string;
};

export type JoystickAxisSemantic = "custom" | "rotation" | "translation" | "vertical";

export type JoystickAxisHint = {
  color: string;
  negative_label: string;
  positive_label: string;
  semantic: JoystickAxisSemantic;
};

export type JoystickRuntimeBinding = {
  adapter: "custom" | "teleop" | "topic";
  target: string;
  value_mapping?: Record<string, unknown>;
};

export type JoystickSettings = {
  binding?: "joy" | "rot";
  axis_hints: {
    x: JoystickAxisHint;
    y: JoystickAxisHint;
  };
  deadzone: number;
  labels: {
    bottom: string;
    left: string;
    right: string;
    top: string;
  };
  mode_id: string;
  publish_rate_hz: number;
  runtime_binding: JoystickRuntimeBinding;
  show_details: boolean;
  zero_on_release: boolean;
};

export type LabelSettings = {
  align: "left" | "center" | "right";
  fontSize: number;
  text: string;
};

export type PlotSettings = {
  fieldPath: string;
  historySeconds: number;
  maxSamples: number;
  messageType: string;
  samples: number[];
  show_details: boolean;
  showLegend: boolean;
  topic: string;
  unit: string;
  variant: "area" | "bars" | "sparkline";
  yMax?: number;
  yMin?: number;
};

export type SliderSettings = {
  binding?: string;
  direction: "horizontal" | "vertical";
  intent_label: string;
  max: number;
  messageType?: string;
  min: number;
  returnToCenter: boolean;
  runtime_binding?: JoystickRuntimeBinding;
  show_details: boolean;
  step: number;
  topic?: string;
  unit: string;
  value?: number;
};

export type ToggleSettings = {
  offLabel: string;
  initialValue: boolean;
  messageType?: string;
  offPayload: unknown;
  onLabel: string;
  onPayload: unknown;
  presetId?: string;
  show_details: boolean;
  topic?: string;
};

export type TopicEchoSettings = {
  fieldPath: string;
  maxMessages: number;
  messageType: string;
  prettyPrint: boolean;
  show_details: boolean;
  topic: string;
};

export type TopicPlotSettings = {
  fieldPath: string;
  historySeconds: number;
  maxSamples: number;
  messageType: string;
  show_details: boolean;
  topic: string;
  unit: string;
  variant: "area" | "bars" | "sparkline";
  yMax?: number;
  yMin?: number;
};

export type JointTableSettings = {
  /** Per-joint [lower, upper] in radians; a joint without one reports no proximity. */
  joint_limits: Record<string, [number, number]>;
  messageType: string;
  show_details: boolean;
  topic: string;
};

export type JacobianSettings = {
  messageType: string;
  show_details: boolean;
  topic: string;
};

export type PlotBoardSettings = {
  history_seconds: number;
  max_samples: number;
  picker: { enabled: boolean; persist_per_profile: boolean };
  series: Record<string, unknown>[];
  show_details: boolean;
  /** Widen y_min/y_max to take in data outside them; never narrower than declared. */
  y_fit_data: boolean;
  y_max: number;
  y_min: number;
};

export type PlotPickerSettings = {
  plot_id: string;
  show_details: boolean;
  show_unavailable: boolean;
  show_value: boolean;
  unavailable: { label: string; note: string }[];
};

export type ValueStripSettings = {
  series: Record<string, unknown>[];
  show_details: boolean;
};

export type PositionLibrarySettings = {
  /** Capture filter and order; empty captures every joint in the sample. */
  jointNames: string[];
  jointStateTopic: string;
  show_details: boolean;
};

export type Robot3dSettings = {
  description: string;
  jointStateTopic: string;
  modelSource: "extension" | "urdf-url";
  robotModelUrl: string;
  showAxes: boolean;
};

export type UnknownWidgetSettings = Record<string, unknown>;

const BUTTON_DEFAULT_SETTINGS: ButtonSettings = {};

const CAMERA_DEFAULT_SETTINGS: CameraSettings = {
  fitMode: "contain",
  showHeader: true,
  showStatus: true,
  source: "placeholder",
  streamUrl: "",
  topic: "",
  webcamPicker: true,
};

const COMMAND_BUTTON_DEFAULT_SETTINGS: CommandButtonSettings = {
  action_feedback: "none",
  action_id: "",
  action_label: "",
  button_label: "",
  cancellable: false,
  command: "",
  confirm_label: "Confirm?",
  confirm_press: false,
  confirm_timeout_seconds: 5,
  messageType: "",
  payload: "",
  presetId: "",
  topic: "",
};

const EVENT_LOG_DEFAULT_SETTINGS: EventLogSettings = {
  entries: [
    {
      severity: "info",
      summary: "No events yet",
      detail: "Connect a runtime log source or configure static events for this screen.",
    },
  ],
  fieldPath: "",
  maxEntries: 20,
  messageType: "",
  severityFilter: ["info", "warning", "error", "success"],
  show_details: false,
  showTimestamps: true,
  topic: "",
};

const GAUGE_DEFAULT_SETTINGS: GaugeSettings = {
  fieldPath: "data",
  max: 1,
  messageType: "",
  min: 0,
  show_details: false,
  topic: "",
  unit: "",
  value: 0,
};

const GESTURE_PAD_DEFAULT_SETTINGS: GesturePadSettings = {
  angleLabel: "Angle",
  command: "gesture",
  messageType: "",
  powerLabel: "Power",
  show_details: false,
  topic: "",
};

const JOYSTICK_DEFAULT_SETTINGS: JoystickSettings = {
  binding: "joy",
  axis_hints: {
    x: {
      color: "var(--bloom-axis-translation)",
      negative_label: "X-",
      positive_label: "X+",
      semantic: "translation",
    },
    y: {
      color: "var(--bloom-axis-translation)",
      negative_label: "Y-",
      positive_label: "Y+",
      semantic: "translation",
    },
  },
  deadzone: 0.1,
  labels: { bottom: "Y-", left: "X-", right: "X+", top: "Y+" },
  mode_id: "both",
  publish_rate_hz: 30,
  runtime_binding: {
    adapter: "teleop",
    target: "both",
    value_mapping: {
      mode: 3,
      target_topic: "/joystick_cartesian_command",
    },
  },
  show_details: false,
  zero_on_release: true,
};

const LABEL_DEFAULT_SETTINGS: LabelSettings = {
  align: "left",
  fontSize: 20,
  text: "Text",
};

const PLOT_DEFAULT_SETTINGS: PlotSettings = {
  fieldPath: "data",
  historySeconds: 10,
  maxSamples: 500,
  messageType: "",
  samples: [0.18, 0.34, 0.28, 0.52, 0.47, 0.68, 0.61, 0.79, 0.73, 0.88],
  show_details: false,
  showLegend: true,
  topic: "",
  unit: "",
  variant: "area",
};

const SLIDER_DEFAULT_SETTINGS: SliderSettings = {
  direction: "vertical",
  intent_label: "",
  max: 1,
  min: -1,
  returnToCenter: false,
  show_details: false,
  step: 0.01,
  unit: "",
  value: 0,
};

/** The contract fallback for a field a toggle does not carry; the palette's starting point is separate. */
const TOGGLE_DEFAULT_SETTINGS: ToggleSettings = {
  initialValue: false,
  offLabel: "Inactive",
  offPayload: false,
  onLabel: "Active",
  onPayload: true,
  show_details: false,
};

const TOPIC_ECHO_DEFAULT_SETTINGS: TopicEchoSettings = {
  fieldPath: "",
  maxMessages: 100,
  messageType: "",
  prettyPrint: true,
  show_details: true,
  topic: "",
};

const TOPIC_PLOT_DEFAULT_SETTINGS: TopicPlotSettings = {
  fieldPath: "data",
  historySeconds: 30,
  maxSamples: 500,
  messageType: "",
  show_details: true,
  topic: "",
  unit: "",
  variant: "area",
};

const JOINT_TABLE_DEFAULT_SETTINGS: JointTableSettings = {
  joint_limits: {},
  messageType: "sensor_msgs/msg/JointState",
  show_details: false,
  topic: "/joint_states",
};

const JACOBIAN_DEFAULT_SETTINGS: JacobianSettings = {
  messageType: "std_msgs/msg/Float64MultiArray",
  show_details: false,
  topic: "/ee_jac",
};

const PLOT_BOARD_DEFAULT_SETTINGS: PlotBoardSettings = {
  history_seconds: 30,
  max_samples: 900,
  picker: { enabled: true, persist_per_profile: true },
  series: [],
  show_details: false,
  y_fit_data: true,
  y_max: 1,
  y_min: -1,
};

const PLOT_PICKER_DEFAULT_SETTINGS: PlotPickerSettings = {
  plot_id: "",
  show_details: false,
  show_unavailable: true,
  show_value: false,
  unavailable: [],
};

const VALUE_STRIP_DEFAULT_SETTINGS: ValueStripSettings = {
  series: [],
  show_details: false,
};

const POSITION_LIBRARY_DEFAULT_SETTINGS: PositionLibrarySettings = {
  jointNames: [],
  jointStateTopic: "/joint_states",
  show_details: false,
};

const ROBOT_3D_DEFAULT_SETTINGS: Robot3dSettings = {
  description: "Optional 3D robot visualization extension.",
  jointStateTopic: "/joint_states",
  modelSource: "extension",
  robotModelUrl: "",
  showAxes: true,
};

const UNKNOWN_DEFAULT_SETTINGS: UnknownWidgetSettings = {};

export const WIDGET_SETTINGS_CONTRACTS: Readonly<Record<WidgetKind, WidgetSettingsContract>> = {
  button: createContract("button", [], BUTTON_DEFAULT_SETTINGS, validateButtonSettings),
  camera: createContract(
    "camera",
    [
      { key: "streamUrl", label: "Stream URL", type: "text", required: false },
      // A compressed image topic, not a raw one: the raw frame is converted nowhere on the way.
      { key: "topic", label: "ROS image topic (compressed)", type: "text", required: false },
      {
        key: "source",
        label: "Source",
        type: "select",
        required: true,
        options: ["placeholder", "ros-topic", "stream-url", "webcam"],
      },
      { key: "fitMode", label: "Fit mode", type: "select", required: true, options: ["contain", "cover"] },
      { key: "showHeader", label: "Show header", type: "boolean", required: true },
      { key: "showStatus", label: "Show status", type: "boolean", required: true },
      { key: "webcamPicker", label: "Show webcam picker", type: "boolean", required: true },
    ],
    CAMERA_DEFAULT_SETTINGS,
    validateCameraSettings,
  ),
  "command-button": createContract(
    "command-button",
    [
      { key: "command", label: "Command", type: "text", required: true },
      { key: "button_label", label: "Button label", type: "text", required: false },
      { key: "action_id", label: "Action id", type: "text", required: false },
      { key: "action_label", label: "Action label", type: "text", required: false },
      // Not required: nothing reads either one, so demanding an answer promised a behaviour that
      // does not exist. They stay in the contract so shipped apps keep validating.
      {
        key: "action_feedback",
        label: "Action feedback",
        type: "select",
        required: false,
        options: ["none", "progress", "result"],
      },
      { key: "cancellable", label: "Cancellable", type: "boolean", required: false },
      // Hold to run: the shipped Snake button. The released payload is what goes out on let-go.
      { key: "momentary", label: "Hold to run", type: "boolean", required: false },
      { key: "pressed_label", label: "Label while held", type: "text", required: false },
      { key: "released_label", label: "Label when released", type: "text", required: false },
      { key: "releasedPayload", label: "Payload on release", type: "json", required: false },
      // Press twice to move: the guard on every joint-target button.
      { key: "confirm_press", label: "Confirm the press", type: "boolean", required: false },
      { key: "confirm_label", label: "Confirm label", type: "text", required: false },
      {
        key: "confirm_timeout_seconds",
        label: "Stays armed for (s, 0 = until pressed again)",
        type: "number",
        required: false,
      },
      { key: "variant", label: "Emphasis", type: "select", required: false, options: ["default", "danger"] },
      { key: "hint", label: "Hint", type: "text", required: false },
      { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: false },
      { key: "topic", label: "Output topic", type: "text", required: false },
      { key: "messageType", label: "ROS message type", type: "text", required: false },
      { key: "payload", label: "Payload", type: "json", required: false },
      { key: "presetId", label: "Preset id", type: "text", required: false },
      { key: "runtime_binding", label: "Runtime binding", type: "json", required: false },
    ],
    COMMAND_BUTTON_DEFAULT_SETTINGS,
    validateCommandButtonSettings,
  ),
  "event-log": createContract(
    "event-log",
    [
      { key: "entries", label: "Entries", type: "json", required: true },
      { key: "topic", label: "Input topic", type: "text", required: false },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "fieldPath", label: "Field path", type: "text", required: false },
      { key: "maxEntries", label: "Maximum entries", type: "number", required: true },
      { key: "severityFilter", label: "Severity filter", type: "json", required: true },
      { key: "showTimestamps", label: "Show timestamps", type: "boolean", required: true },
      { key: "newest_first", label: "Newest first", type: "boolean", required: false },
      // The map that turns a raw mode string into operator language on Command sources.
      { key: "notes", label: "Notes per value", type: "json", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    EVENT_LOG_DEFAULT_SETTINGS,
    validateEventLogSettings,
  ),
  gauge: createContract(
    "gauge",
    [
      { key: "min", label: "Minimum", type: "number", required: true },
      { key: "max", label: "Maximum", type: "number", required: true },
      { key: "value", label: "Value", type: "number", required: true },
      { key: "topic", label: "Input topic", type: "text", required: false },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "fieldPath", label: "Field path", type: "text", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
      { key: "unit", label: "Unit", type: "text", required: false },
    ],
    GAUGE_DEFAULT_SETTINGS,
    validateGaugeSettings,
  ),
  "gesture-pad": createContract(
    "gesture-pad",
    [
      // Not required: the dispatcher never reads the binding this becomes, so an answer changes
      // nothing. Output topic and message type are what make a gesture pad publish.
      { key: "command", label: "Command", type: "text", required: false },
      { key: "topic", label: "Output topic", type: "text", required: false },
      { key: "messageType", label: "ROS message type", type: "text", required: false },
      { key: "angleLabel", label: "Angle label", type: "text", required: true },
      { key: "powerLabel", label: "Power label", type: "text", required: true },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    GESTURE_PAD_DEFAULT_SETTINGS,
    validateGesturePadSettings,
  ),
  joystick: createContract(
    "joystick",
    [
      { key: "mode_id", label: "Mode", type: "text", required: true },
      { key: "binding", label: "Legacy binding", type: "select", required: false, options: ["joy", "rot"] },
      { key: "deadzone", label: "Deadzone", type: "number", required: true },
      { key: "publish_rate_hz", label: "Publish rate", type: "number", required: true },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
      { key: "zero_on_release", label: "Zero on release", type: "boolean", required: true },
      { key: "labels", label: "Axis labels", type: "json", required: true },
      { key: "axis_hints", label: "Axis hints", type: "json", required: true },
      { key: "runtime_binding", label: "Runtime binding", type: "json", required: true },
    ],
    JOYSTICK_DEFAULT_SETTINGS,
    validateJoystickSettings,
  ),
  label: createContract(
    "label",
    [
      { key: "text", label: "Text", type: "text", required: true },
      { key: "fontSize", label: "Font size", type: "number", required: true },
      { key: "align", label: "Alignment", type: "select", required: true, options: ["left", "center", "right"] },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: false },
    ],
    LABEL_DEFAULT_SETTINGS,
    validateLabelSettings,
  ),
  plot: createContract(
    "plot",
    [
      { key: "topic", label: "Input topic", type: "text", required: false },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "fieldPath", label: "Field path", type: "text", required: false },
      { key: "historySeconds", label: "History duration", type: "number", required: true },
      { key: "maxSamples", label: "Maximum samples", type: "number", required: true },
      { key: "showLegend", label: "Show legend", type: "boolean", required: true },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
      { key: "samples", label: "Preview samples", type: "json", required: true },
      { key: "variant", label: "Variant", type: "select", required: true, options: ["area", "bars", "sparkline"] },
      { key: "unit", label: "Unit", type: "text", required: false },
      { key: "yMin", label: "Y minimum", type: "number", required: false },
      { key: "yMax", label: "Y maximum", type: "number", required: false },
    ],
    PLOT_DEFAULT_SETTINGS,
    validatePlotSettings,
  ),
  slider: createContract(
    "slider",
    [
      { key: "binding", label: "Binding", type: "text", required: false },
      { key: "min", label: "Minimum", type: "number", required: true },
      { key: "max", label: "Maximum", type: "number", required: true },
      { key: "step", label: "Step", type: "number", required: true },
      { key: "direction", label: "Direction", type: "select", required: true, options: ["horizontal", "vertical"] },
      { key: "intent_label", label: "Operator intent", type: "text", required: false },
      { key: "unit", label: "Unit", type: "text", required: false },
      { key: "value", label: "Initial value", type: "number", required: false },
      { key: "returnToCenter", label: "Return to center", type: "boolean", required: true },
      // Segments are how the operator speed limit ships: Slow / Medium / Fast against three values.
      { key: "variant", label: "Style", type: "select", required: false, options: ["continuous", "segments"] },
      { key: "segment_labels", label: "Segment labels", type: "json", required: false },
      { key: "segment_values", label: "Segment values", type: "json", required: false },
      { key: "labels", label: "Direction labels", type: "json", required: false },
      {
        key: "title_placement",
        label: "Title placement",
        type: "select",
        required: false,
        options: ["above", "overlay"],
      },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
      { key: "topic", label: "Output topic", type: "text", required: false },
      { key: "messageType", label: "ROS message type", type: "text", required: false },
      { key: "runtime_binding", label: "Runtime binding", type: "json", required: false },
    ],
    SLIDER_DEFAULT_SETTINGS,
    validateSliderSettings,
  ),
  toggle: createContract(
    "toggle",
    [
      { key: "initialValue", label: "Initial value", type: "boolean", required: true },
      { key: "topic", label: "Output topic", type: "text", required: false },
      { key: "messageType", label: "ROS message type", type: "text", required: false },
      { key: "onLabel", label: "Active label", type: "text", required: true },
      { key: "offLabel", label: "Inactive label", type: "text", required: true },
      { key: "onPayload", label: "ON payload", type: "json", required: true },
      { key: "offPayload", label: "OFF payload", type: "json", required: true },
      // The labels above name what the press will do; these name what was commanded.
      { key: "onStateLabel", label: "State when ON", type: "text", required: false },
      { key: "offStateLabel", label: "State when OFF", type: "text", required: false },
      { key: "layout", label: "Layout", type: "select", required: false, options: ["card", "inline"] },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    TOGGLE_DEFAULT_SETTINGS,
    validateToggleSettings,
  ),
  "topic-echo": createContract(
    "topic-echo",
    [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "fieldPath", label: "Field path", type: "text", required: false },
      { key: "maxMessages", label: "Max messages", type: "number", required: true },
      { key: "prettyPrint", label: "Pretty print", type: "boolean", required: true },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    TOPIC_ECHO_DEFAULT_SETTINGS,
    validateTopicEchoSettings,
  ),
  "topic-plot": createContract(
    "topic-plot",
    [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "fieldPath", label: "Field path", type: "text", required: true },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
      { key: "historySeconds", label: "History duration", type: "number", required: true },
      { key: "maxSamples", label: "Max samples", type: "number", required: true },
      { key: "variant", label: "Variant", type: "select", required: true, options: ["area", "bars", "sparkline"] },
      { key: "unit", label: "Unit", type: "text", required: false },
      { key: "yMin", label: "Y minimum", type: "number", required: false },
      { key: "yMax", label: "Y maximum", type: "number", required: false },
    ],
    TOPIC_PLOT_DEFAULT_SETTINGS,
    validateTopicPlotSettings,
  ),
  "joint-table": createContract(
    "joint-table",
    [
      { key: "topic", label: "Joint state topic", type: "text", required: true },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "joint_limits", label: "Joint limits (name: [lower, upper])", type: "json", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    JOINT_TABLE_DEFAULT_SETTINGS,
    (settings) => {
      const errors = [...validateString(settings, "topic"), ...validateBoolean(settings, "show_details")];
      return errors.length > 0 ? fail(errors) : succeed(settings as JointTableSettings);
    },
  ),
  jacobian: createContract(
    "jacobian",
    [
      { key: "topic", label: "Jacobian topic", type: "text", required: true },
      { key: "messageType", label: "Message type", type: "text", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    JACOBIAN_DEFAULT_SETTINGS,
    (settings) => {
      const errors = [...validateString(settings, "topic"), ...validateBoolean(settings, "show_details")];
      return errors.length > 0 ? fail(errors) : succeed(settings as JacobianSettings);
    },
  ),
  "plot-board": createContract(
    "plot-board",
    [
      {
        key: "series",
        label: "Series (topic, field_path, label, unit, color, enabled, emphasis)",
        type: "json",
        required: true,
      },
      { key: "history_seconds", label: "History duration", type: "number", required: true },
      { key: "max_samples", label: "Max samples per series", type: "number", required: true },
      { key: "y_min", label: "Y minimum", type: "number", required: true },
      { key: "y_max", label: "Y maximum", type: "number", required: true },
      { key: "y_fit_data", label: "Widen Y range to fit data", type: "boolean", required: false },
      { key: "picker", label: "Picker", type: "json", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    PLOT_BOARD_DEFAULT_SETTINGS,
    validatePlotBoardSettings,
  ),
  "plot-picker": createContract(
    "plot-picker",
    [
      { key: "plot_id", label: "Plot board widget id", type: "text", required: true },
      { key: "show_value", label: "Show live values", type: "boolean", required: false },
      { key: "show_unavailable", label: "Show moved series", type: "boolean", required: false },
      { key: "unavailable", label: "Moved series (label, note)", type: "json", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    PLOT_PICKER_DEFAULT_SETTINGS,
    validatePlotPickerSettings,
  ),
  "value-strip": createContract(
    "value-strip",
    [
      { key: "series", label: "Series (topic, field_path, label, unit, color)", type: "json", required: true },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    VALUE_STRIP_DEFAULT_SETTINGS,
    validateValueStripSettings,
  ),
  "position-library": createContract(
    "position-library",
    [
      { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
      { key: "jointNames", label: "Joint names (capture order)", type: "json", required: false },
      { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    ],
    POSITION_LIBRARY_DEFAULT_SETTINGS,
    validatePositionLibrarySettings,
  ),
  "robot-3d": createContract(
    "robot-3d",
    [
      // Not required: nothing fetches a model, which the palette's maturity note already says.
      {
        key: "modelSource",
        label: "Model source",
        type: "select",
        required: false,
        options: ["extension", "urdf-url"],
      },
      { key: "robotModelUrl", label: "Robot model URL", type: "text", required: false },
      { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
      { key: "showAxes", label: "Show axes", type: "boolean", required: true },
      { key: "description", label: "Description", type: "text", required: false },
    ],
    ROBOT_3D_DEFAULT_SETTINGS,
    validateRobot3dSettings,
  ),
  unknown: createContract("unknown", [], UNKNOWN_DEFAULT_SETTINGS, validateUnknownSettings),
};

export function getWidgetSettingsContract(kind: WidgetKind): WidgetSettingsContract {
  return WIDGET_SETTINGS_CONTRACTS[kind] ?? WIDGET_SETTINGS_CONTRACTS.unknown;
}

export function getDefaultWidgetSettings(kind: WidgetKind): Record<string, unknown> {
  return cloneSettings(getWidgetSettingsContract(kind).defaultSettings);
}

export function validateWidgetSettings(
  kind: WidgetKind,
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult {
  return getWidgetSettingsContract(kind).validate(settings);
}

export function normalizeWidgetSettings(
  kind: WidgetKind,
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult {
  const mergedSettings = {
    ...getDefaultWidgetSettings(kind),
    ...settings,
  };
  if (kind === "joystick") {
    return validateWidgetSettings(kind, normalizeJoystickCompatibility(mergedSettings, settings));
  }
  if (kind === "camera") {
    return validateWidgetSettings(kind, normalizeCameraCompatibility(mergedSettings));
  }
  if (kind === "slider") {
    return validateWidgetSettings(kind, {
      ...getDefaultWidgetSettings(kind),
      ...normalizeSliderCompatibility(settings),
    });
  }
  return validateWidgetSettings(kind, mergedSettings);
}

/** About 20 stops across a slider's travel, per operator feedback. */
export const SLIDER_TARGET_INCREMENTS = 20;

/** Step ≈ range/20, snapped to 1/2/2.5/5 × 10ⁿ. */
export function deriveSliderStep(min: number, max: number): number {
  const range = Math.abs(max - min);
  if (!Number.isFinite(range) || range <= 0) {
    return SLIDER_DEFAULT_SETTINGS.step;
  }

  const rawStep = range / SLIDER_TARGET_INCREMENTS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const roundStep = [1, 2, 2.5, 5, 10]
    .map((multiplier) => multiplier * magnitude)
    .reduce((best, candidate) => (Math.abs(candidate - rawStep) < Math.abs(best - rawStep) ? candidate : best));
  // Trim float noise from the 2.5 multiplier.
  return Number.parseFloat(roundStep.toPrecision(3));
}

/**
 * Alias the snake_case keys configs in the wild carry (orientation,
 * return_to_center). Runs on raw settings so canonical keys win.
 */
function normalizeSliderCompatibility(settings: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...settings };
  if (!("direction" in settings) && (settings.orientation === "horizontal" || settings.orientation === "vertical")) {
    normalized.direction = settings.orientation;
  }
  if (!("returnToCenter" in settings) && typeof settings.return_to_center === "boolean") {
    normalized.returnToCenter = settings.return_to_center;
  }
  return normalized;
}

export type RosMessageTogglePreset = {
  id: string;
  label: string;
  description: string;
  messageType: string;
  onPayload: string;
  offPayload: string;
};

export type RosMessageCommandPreset = {
  id: string;
  label: string;
  description: string;
  buttonLabel: string;
  category: "bridge" | "motion" | "safety" | "saved-preset" | "state-machine" | "utility";
  command: string;
  messageType: string;
  payload: string;
  topic: string;
};

export const ROS_MESSAGE_TOGGLE_PRESETS: readonly RosMessageTogglePreset[] = [
  {
    id: "bool",
    label: "Bool true / false",
    description: "Publish a standard ROS bool for ON and OFF.",
    messageType: "std_msgs/msg/Bool",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
  },
  {
    id: "float64",
    label: "Float64 1 / 0",
    description: "Publish numeric ON/OFF values for simple bridge topics.",
    messageType: "std_msgs/msg/Float64",
    onPayload: "{data: 1.0}",
    offPayload: "{data: 0.0}",
  },
  {
    id: "int32",
    label: "Int32 1 / 0",
    description: "Publish integer ON/OFF values when the subscriber expects Int32.",
    messageType: "std_msgs/msg/Int32",
    onPayload: "{data: 1}",
    offPayload: "{data: 0}",
  },
  {
    id: "string-on-off",
    label: "String on / off",
    description: "Send text commands while keeping the ON/OFF interaction.",
    messageType: "std_msgs/msg/String",
    onPayload: "{data: 'on'}",
    offPayload: "{data: 'off'}",
  },
  {
    id: "state-machine",
    label: "State machine commands",
    description: "Example for toggling between two state machine commands.",
    messageType: "std_msgs/msg/String",
    onPayload: "{data: 'activate_throw'}",
    offPayload: "{data: 'teleop'}",
  },
  {
    id: "digital-output-array",
    label: "Digital output array",
    description: "Useful for bridges that expect [pin, state].",
    messageType: "std_msgs/msg/Int32MultiArray",
    onPayload: "{data: [13, 1]}",
    offPayload: "{data: [13, 0]}",
  },
  {
    id: "vector3",
    label: "Vector3 mapping",
    description: "Example of a structured payload with named ROS fields.",
    messageType: "geometry_msgs/msg/Vector3",
    onPayload: "{x: 0.1, y: 0.0, z: 0.0}",
    offPayload: "{x: 0.0, y: 0.0, z: 0.0}",
  },
];

export const ROS_MESSAGE_COMMAND_PRESETS: readonly RosMessageCommandPreset[] = [
  {
    id: "state-machine-activate-throw",
    label: "State machine command",
    description: "Publish one string command to a ROS state-machine topic.",
    buttonLabel: "Activate throw",
    category: "state-machine",
    command: "activate_throw",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'activate_throw'}",
    topic: "/petanque_state_machine/change_state",
  },
  {
    id: "emergency-stop-bool",
    label: "Emergency stop",
    description: "Publish a boolean stop request on a safety topic.",
    buttonLabel: "Stop",
    category: "safety",
    command: "emergency_stop",
    messageType: "std_msgs/msg/Bool",
    payload: "{data: true}",
    topic: "/explorer/emergency_stop",
  },
  {
    id: "trigger-bool",
    label: "Trigger action",
    description: "Publish a one-shot boolean trigger to any configured topic.",
    buttonLabel: "Trigger",
    category: "utility",
    command: "trigger",
    messageType: "std_msgs/msg/Bool",
    payload: "{data: true}",
    topic: "/example/trigger",
  },
  {
    id: "digital-output-on",
    label: "Digital output ON",
    description: "Publish a structured array payload for an Arduino-style digital output bridge.",
    buttonLabel: "Pin ON",
    category: "bridge",
    command: "digital_output_on",
    messageType: "std_msgs/msg/Int32MultiArray",
    payload: "{data: [13, 1]}",
    topic: "/ui/ros_toggle",
  },
  {
    id: "saved-position-save-current",
    label: "Save current position",
    description: "Capture the current robot pose through an app-specific saved-position adapter.",
    buttonLabel: "Save pose",
    category: "saved-preset",
    command: "saved_position.save_current",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'save_current'}",
    topic: "/explorer/saved_position/command",
  },
  {
    id: "saved-position-replay-selected",
    label: "Replay saved position",
    description: "Request replay of the selected saved pose without a dedicated Explorer widget.",
    buttonLabel: "Replay pose",
    category: "saved-preset",
    command: "saved_position.replay_selected",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'replay_selected'}",
    topic: "/explorer/saved_position/command",
  },
  {
    id: "saved-position-cancel-motion",
    label: "Cancel saved-position motion",
    description: "Cancel an in-progress saved-position motion through the same generic command contract.",
    buttonLabel: "Cancel motion",
    category: "motion",
    command: "saved_position.cancel_motion",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'cancel_motion'}",
    topic: "/explorer/saved_position/command",
  },
];

export function getRosMessageCommandPresetsByCategory(): ReadonlyMap<
  RosMessageCommandPreset["category"],
  readonly RosMessageCommandPreset[]
> {
  const groups = new Map<RosMessageCommandPreset["category"], RosMessageCommandPreset[]>();
  for (const preset of ROS_MESSAGE_COMMAND_PRESETS) {
    groups.set(preset.category, [...(groups.get(preset.category) ?? []), preset]);
  }
  return groups;
}

export function getDefaultRosMessageTogglePayloads(
  messageType: string,
): Pick<ToggleSettings, "offPayload" | "onPayload"> {
  const normalizedType = messageType.trim().toLowerCase();

  if (normalizedType === "std_msgs/msg/bool") {
    return {
      onPayload: "{data: true}",
      offPayload: "{data: false}",
    };
  }
  if (normalizedType === "std_msgs/msg/string") {
    return {
      onPayload: "{data: 'on'}",
      offPayload: "{data: 'off'}",
    };
  }
  if (normalizedType === "std_msgs/msg/int32") {
    return {
      onPayload: "{data: 1}",
      offPayload: "{data: 0}",
    };
  }
  if (normalizedType === "std_msgs/msg/int32multiarray" || normalizedType === "std_msgs/msg/uint8multiarray") {
    return {
      onPayload: "{data: [13, 1]}",
      offPayload: "{data: [13, 0]}",
    };
  }
  if (normalizedType === "geometry_msgs/msg/vector3") {
    return {
      onPayload: "{x: 0.1, y: 0.0, z: 0.0}",
      offPayload: "{x: 0.0, y: 0.0, z: 0.0}",
    };
  }
  return {
    onPayload: "{data: 1.0}",
    offPayload: "{data: 0.0}",
  };
}

export function buildRosMessageToggleCliExample(
  settings: Pick<ToggleSettings, "messageType" | "offPayload" | "onPayload" | "topic">,
  nextState: "off" | "on",
): string {
  const topic = settings.topic?.trim() || "/example/topic";
  const messageType = settings.messageType?.trim() || "std_msgs/msg/Float64";
  const payload = String(nextState === "on" ? settings.onPayload : settings.offPayload).replaceAll('"', '\\"');
  return `ros2 topic pub -1 ${topic} ${messageType} "${payload}"`;
}

export function buildRosMessageCommandCliExample(
  settings: Pick<CommandButtonSettings, "messageType" | "payload" | "topic">,
): string {
  const topic = settings.topic?.trim() || "/example/topic";
  const messageType = settings.messageType?.trim() || "std_msgs/msg/Bool";
  const payload = String(settings.payload ?? "{data: true}").replaceAll('"', '\\"');
  return `ros2 topic pub -1 ${topic} ${messageType} "${payload}"`;
}

export function findMatchingRosMessageTogglePreset(
  settings: Pick<ToggleSettings, "messageType" | "offPayload" | "onPayload">,
): RosMessageTogglePreset | null {
  const normalizedMessageType = settings.messageType?.trim().toLowerCase() ?? "";
  const normalizedOnPayload = String(settings.onPayload).trim();
  const normalizedOffPayload = String(settings.offPayload).trim();

  return (
    ROS_MESSAGE_TOGGLE_PRESETS.find(
      (preset) =>
        preset.messageType.trim().toLowerCase() === normalizedMessageType &&
        preset.onPayload.trim() === normalizedOnPayload &&
        preset.offPayload.trim() === normalizedOffPayload,
    ) ?? null
  );
}

export function findMatchingRosMessageCommandPreset(
  settings: Pick<CommandButtonSettings, "messageType" | "payload" | "topic">,
): RosMessageCommandPreset | null {
  const normalizedMessageType = settings.messageType?.trim().toLowerCase() ?? "";
  const normalizedPayload = String(settings.payload ?? "").trim();
  const normalizedTopic = settings.topic?.trim() ?? "";

  return (
    ROS_MESSAGE_COMMAND_PRESETS.find(
      (preset) =>
        preset.messageType.trim().toLowerCase() === normalizedMessageType &&
        preset.payload.trim() === normalizedPayload &&
        preset.topic.trim() === normalizedTopic,
    ) ?? null
  );
}

function createContract<TSettings extends Record<string, unknown>>(
  kind: WidgetKind,
  fields: WidgetSettingField[],
  defaultSettings: TSettings,
  validate: (settings: Record<string, unknown>) => WidgetSettingsValidationResult<TSettings>,
): WidgetSettingsContract<TSettings> {
  return {
    kind,
    fields,
    defaultSettings,
    validate,
  };
}

function validateButtonSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<ButtonSettings> {
  return succeed(settings as ButtonSettings);
}

function validateCameraSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<CameraSettings> {
  const errors = [
    ...validateString(settings, "streamUrl", { allowEmpty: true }),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateOneOf(settings, "source", ["placeholder", "ros-topic", "stream-url", "webcam"]),
    ...validateOneOf(settings, "fitMode", ["contain", "cover"]),
    ...validateBoolean(settings, "showHeader"),
    ...validateBoolean(settings, "showStatus"),
    ...validateBoolean(settings, "webcamPicker"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CameraSettings);
}

function validateCommandButtonSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<CommandButtonSettings> {
  const errors = [
    ...validateString(settings, "command", { allowEmpty: true }),
    ...validateString(settings, "button_label", { allowEmpty: true }),
    ...validateString(settings, "action_id", { allowEmpty: true }),
    ...validateString(settings, "action_label", { allowEmpty: true }),
    ...validateOneOf(settings, "action_feedback", ["none", "progress", "result"]),
    ...validateBoolean(settings, "cancellable"),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "presetId", { allowEmpty: true }),
  ];
  if ("runtime_binding" in settings && settings.runtime_binding !== undefined) {
    errors.push(...validateTeleopFrameRuntimeBinding(settings.runtime_binding));
  }
  if (!isJsonSerializable(settings.payload)) {
    errors.push({ field: "payload", message: "payload must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CommandButtonSettings);
}

function validateTeleopFrameRuntimeBinding(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "runtime_binding", message: "runtime_binding must be an object" }];
  }

  const errors: WidgetSettingsValidationError[] = [];
  if (value.adapter !== "teleop-frame") {
    errors.push({ field: "runtime_binding.adapter", message: "adapter must be teleop-frame" });
  }
  if (typeof value.frame_id !== "string" || value.frame_id.trim().length === 0) {
    errors.push({ field: "runtime_binding.frame_id", message: "frame_id is required" });
  }
  return errors;
}

function validateEventLogSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<EventLogSettings> {
  const errors = [
    ...(Array.isArray(settings.entries) ? [] : [{ field: "entries", message: "entries must be an array" }]),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateNumber(settings, "maxEntries", { min: 1 }),
    ...validateBoolean(settings, "showTimestamps"),
    ...validateBoolean(settings, "show_details"),
  ];
  if (!isStringArray(settings.severityFilter)) {
    errors.push({ field: "severityFilter", message: "severityFilter must be an array of strings" });
  }
  if (!isJsonSerializable(settings.entries)) {
    errors.push({ field: "entries", message: "entries must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as EventLogSettings);
}

function validateGaugeSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<GaugeSettings> {
  const errors = [
    ...validateNumber(settings, "min"),
    ...validateNumber(settings, "max"),
    ...validateNumber(settings, "value"),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateBoolean(settings, "show_details"),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if (isNumber(settings.min) && isNumber(settings.max) && settings.min >= settings.max) {
    errors.push({ field: "max", message: "max must be greater than min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as GaugeSettings);
}

function validateGesturePadSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<GesturePadSettings> {
  const errors = [
    ...validateString(settings, "command", { allowEmpty: true }),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "angleLabel"),
    ...validateString(settings, "powerLabel"),
    ...validateBoolean(settings, "show_details"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as GesturePadSettings);
}

/** True when this pad's axes drive the angular components. */
function drivesRotation(settings: Record<string, unknown>): boolean {
  const runtimeBinding = isRecord(settings.runtime_binding) ? settings.runtime_binding : undefined;
  const axisMapping = runtimeBinding && isRecord(runtimeBinding.axis_mapping) ? runtimeBinding.axis_mapping : undefined;
  if (!axisMapping) {
    return false;
  }
  return Object.values(axisMapping).some(
    (axis) => isRecord(axis) && typeof axis.component === "string" && axis.component.startsWith("angular_"),
  );
}

/**
 * `settings` is already merged with the joystick defaults; `authored` is what the app actually wrote.
 * The distinction matters: the defaults carry translation hints and labels, so asking the merged
 * object whether the author supplied any always answered yes, and the rotation defaults below could
 * never win.
 */
function normalizeJoystickCompatibility(
  settings: Record<string, unknown>,
  authored: Record<string, unknown>,
): Record<string, unknown> {
  const binding = typeof settings.binding === "string" ? settings.binding : undefined;
  // What the pad moves is the honest answer to which hints it carries. The seeds name their axes in
  // runtime_binding and omit the legacy `binding`, so keying off `binding` alone read every seeded
  // joystick as translation: the Builder showed X+/X- in sage for the rotation pad while the runtime
  // drew RX+/RX- in clay.
  const defaults =
    binding === "rot" || drivesRotation(settings)
      ? ROTATION_JOYSTICK_COMPATIBILITY_DEFAULTS
      : TRANSLATION_JOYSTICK_COMPATIBILITY_DEFAULTS;
  const authoredHints = isRecord(authored.axis_hints) ? authored.axis_hints : undefined;
  const usesDefaultMode = settings.mode_id === JOYSTICK_DEFAULT_SETTINGS.mode_id;
  // Only the untouched default gives way to the rotation defaults; an authored binding keeps its mapping.
  const usesDefaultRuntimeBinding = isSameJson(settings.runtime_binding, JOYSTICK_DEFAULT_SETTINGS.runtime_binding);
  const axisHints = authoredHints
    ? {
        x: {
          ...defaults.axis_hints.x,
          ...(isRecord(authoredHints.x) ? authoredHints.x : {}),
        },
        y: {
          ...defaults.axis_hints.y,
          ...(isRecord(authoredHints.y) ? authoredHints.y : {}),
        },
      }
    : defaults.axis_hints;

  return {
    ...settings,
    axis_hints: axisHints,
    labels: isRecord(authored.labels) ? authored.labels : defaults.labels,
    mode_id:
      typeof settings.mode_id === "string" && settings.mode_id.trim().length > 0 && !usesDefaultMode
        ? settings.mode_id
        : defaults.mode_id,
    runtime_binding:
      isRecord(settings.runtime_binding) && !usesDefaultRuntimeBinding
        ? {
            ...defaults.runtime_binding,
            ...settings.runtime_binding,
          }
        : defaults.runtime_binding,
  };
}

const TRANSLATION_JOYSTICK_COMPATIBILITY_DEFAULTS = {
  axis_hints: JOYSTICK_DEFAULT_SETTINGS.axis_hints,
  labels: JOYSTICK_DEFAULT_SETTINGS.labels,
  mode_id: JOYSTICK_DEFAULT_SETTINGS.mode_id,
  runtime_binding: JOYSTICK_DEFAULT_SETTINGS.runtime_binding,
};

const ROTATION_JOYSTICK_COMPATIBILITY_DEFAULTS = {
  axis_hints: {
    x: {
      color: "var(--bloom-axis-rotation)",
      negative_label: "RX-",
      positive_label: "RX+",
      semantic: "rotation",
    },
    y: {
      color: "var(--bloom-axis-rotation)",
      negative_label: "RY-",
      positive_label: "RY+",
      semantic: "rotation",
    },
  },
  labels: { bottom: "RY-", left: "RX-", right: "RX+", top: "RY+" },
  mode_id: "rotation",
  runtime_binding: {
    adapter: "teleop",
    target: "rotation",
  },
} satisfies Pick<JoystickSettings, "axis_hints" | "labels" | "mode_id" | "runtime_binding">;

function validateJoystickSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<JoystickSettings> {
  const errors = [
    ...("binding" in settings && settings.binding !== undefined
      ? validateOneOf(settings, "binding", ["joy", "rot"])
      : []),
    ...validateString(settings, "mode_id"),
    ...validateNumber(settings, "deadzone", { min: 0, max: 1 }),
    ...validateNumber(settings, "publish_rate_hz", { min: 1, max: MAX_JOYSTICK_PUBLISH_RATE_HZ }),
    ...validateBoolean(settings, "show_details"),
    ...validateBoolean(settings, "zero_on_release"),
    ...validateJoystickLabels(settings.labels),
    ...validateJoystickAxisHints(settings.axis_hints),
    ...validateJoystickRuntimeBinding(settings.runtime_binding),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as JoystickSettings);
}

function validateLabelSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<LabelSettings> {
  const errors = [
    ...validateString(settings, "text", { allowEmpty: true }),
    ...validateNumber(settings, "fontSize", { min: 1 }),
    ...validateOneOf(settings, "align", ["left", "center", "right"]),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as LabelSettings);
}

function validatePlotSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<PlotSettings> {
  const errors = [
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateNumber(settings, "historySeconds", { min: 1 }),
    ...validateNumber(settings, "maxSamples", { min: 1 }),
    ...validateBoolean(settings, "show_details"),
    ...validateBoolean(settings, "showLegend"),
    ...validateNumberArray(settings.samples, "samples"),
    ...validateOneOf(settings, "variant", ["area", "bars", "sparkline"]),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if (settings.yMin !== undefined) {
    errors.push(...validateNumber(settings, "yMin"));
  }
  if (settings.yMax !== undefined) {
    errors.push(...validateNumber(settings, "yMax"));
  }
  if (isNumber(settings.yMin) && isNumber(settings.yMax) && settings.yMin >= settings.yMax) {
    errors.push({ field: "yMax", message: "yMax must be greater than yMin" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotSettings);
}

function normalizeCameraCompatibility(settings: Record<string, unknown>): Record<string, unknown> {
  const source = typeof settings.source === "string" ? settings.source.trim().toLowerCase() : "";
  if (source === "camera" || source === "rviz" || source === "stream") {
    return {
      ...settings,
      source: "stream-url",
    };
  }
  return settings;
}

function validateSliderSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<SliderSettings> {
  const errors = [
    ...("binding" in settings && settings.binding !== undefined
      ? validateString(settings, "binding", { allowEmpty: true })
      : []),
    ...validateNumber(settings, "min"),
    ...validateNumber(settings, "max"),
    ...validateNumber(settings, "step", { min: 0 }),
    // A zero step makes the slider compute NaN and silently do nothing.
    ...(settings.step === 0 ? [{ field: "step", message: "step must be greater than 0" }] : []),
    ...("value" in settings && settings.value !== undefined ? validateNumber(settings, "value") : []),
    ...validateOneOf(settings, "direction", ["horizontal", "vertical"]),
    ...("intent_label" in settings && settings.intent_label !== undefined
      ? validateString(settings, "intent_label", { allowEmpty: true })
      : []),
    ...("unit" in settings && settings.unit !== undefined
      ? validateString(settings, "unit", { allowEmpty: true })
      : []),
    ...validateBoolean(settings, "returnToCenter"),
    ...validateBoolean(settings, "show_details"),
    ...("topic" in settings && settings.topic !== undefined
      ? validateString(settings, "topic", { allowEmpty: true })
      : []),
    ...("messageType" in settings && settings.messageType !== undefined
      ? validateString(settings, "messageType", { allowEmpty: true })
      : []),
  ];
  if ("runtime_binding" in settings && settings.runtime_binding !== undefined) {
    errors.push(...validateJoystickRuntimeBinding(settings.runtime_binding));
  }
  if (isNumber(settings.min) && isNumber(settings.max) && settings.min >= settings.max) {
    errors.push({ field: "max", message: "max must be greater than min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as SliderSettings);
}

function validateToggleSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<ToggleSettings> {
  const errors = [
    ...validateBoolean(settings, "initialValue"),
    ...validateString(settings, "onLabel"),
    ...validateString(settings, "offLabel"),
    ...validateBoolean(settings, "show_details"),
  ];
  if ("topic" in settings && settings.topic !== undefined) {
    errors.push(...validateString(settings, "topic", { allowEmpty: true }));
  }
  if ("messageType" in settings && settings.messageType !== undefined) {
    errors.push(...validateString(settings, "messageType", { allowEmpty: true }));
  }
  if ("presetId" in settings && settings.presetId !== undefined) {
    errors.push(...validateString(settings, "presetId", { allowEmpty: true }));
  }
  if (!isJsonSerializable(settings.onPayload)) {
    errors.push({ field: "onPayload", message: "onPayload must be JSON serializable" });
  }
  if (!isJsonSerializable(settings.offPayload)) {
    errors.push({ field: "offPayload", message: "offPayload must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as ToggleSettings);
}

function validateTopicEchoSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<TopicEchoSettings> {
  const errors = [
    ...validateString(settings, "topic"),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateNumber(settings, "maxMessages", { min: 1 }),
    ...validateBoolean(settings, "prettyPrint"),
    ...validateBoolean(settings, "show_details"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as TopicEchoSettings);
}

function validateTopicPlotSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<TopicPlotSettings> {
  const errors = [
    ...validateString(settings, "topic"),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath"),
    ...validateBoolean(settings, "show_details"),
    ...validateNumber(settings, "historySeconds", { min: 1 }),
    ...validateNumber(settings, "maxSamples", { min: 1 }),
    ...validateOneOf(settings, "variant", ["area", "bars", "sparkline"]),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if ("yMin" in settings && settings.yMin !== undefined) {
    errors.push(...validateNumber(settings, "yMin"));
  }
  if ("yMax" in settings && settings.yMax !== undefined) {
    errors.push(...validateNumber(settings, "yMax"));
  }
  if (isNumber(settings.yMin) && isNumber(settings.yMax) && settings.yMin >= settings.yMax) {
    errors.push({ field: "yMax", message: "yMax must be greater than yMin" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as TopicPlotSettings);
}

function validatePlotSeriesList(settings: Record<string, unknown>) {
  if (!Array.isArray(settings.series)) {
    return [{ field: "series", message: "series must be a list" }];
  }
  return settings.series.flatMap((entry, index) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as Record<string, unknown>).topic === "string" &&
    String((entry as Record<string, unknown>).topic).startsWith("/") &&
    typeof ((entry as Record<string, unknown>).field_path ?? (entry as Record<string, unknown>).fieldPath) === "string"
      ? []
      : [{ field: "series", message: `series ${index + 1} needs an absolute topic and a field_path` }],
  );
}

function validatePlotBoardSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PlotBoardSettings> {
  const errors = [
    ...validatePlotSeriesList(settings),
    ...validateNumber(settings, "history_seconds", { min: 1 }),
    ...validateNumber(settings, "max_samples", { min: 1 }),
    ...validateNumber(settings, "y_min"),
    ...validateNumber(settings, "y_max"),
    ...(settings.y_fit_data === undefined ? [] : validateBoolean(settings, "y_fit_data")),
    ...validateBoolean(settings, "show_details"),
  ];
  if (isNumber(settings.y_min) && isNumber(settings.y_max) && settings.y_min >= settings.y_max) {
    errors.push({ field: "y_max", message: "y_max must be greater than y_min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotBoardSettings);
}

function validatePlotPickerSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PlotPickerSettings> {
  const errors = [...validateString(settings, "plot_id"), ...validateBoolean(settings, "show_details")];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotPickerSettings);
}

function validateValueStripSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<ValueStripSettings> {
  const errors = [...validatePlotSeriesList(settings), ...validateBoolean(settings, "show_details")];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as ValueStripSettings);
}

function validatePositionLibrarySettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PositionLibrarySettings> {
  const errors = [...validateString(settings, "jointStateTopic"), ...validateBoolean(settings, "show_details")];
  const jointNames = settings.jointNames;
  if (jointNames !== undefined) {
    if (!Array.isArray(jointNames) || jointNames.some((name) => typeof name !== "string" || !name.trim())) {
      errors.push({ field: "jointNames", message: "must be a list of joint names" });
    }
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, settings: settings as PositionLibrarySettings };
}

function validateRobot3dSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<Robot3dSettings> {
  const errors = [
    ...validateOneOf(settings, "modelSource", ["extension", "urdf-url"]),
    ...validateString(settings, "robotModelUrl", { allowEmpty: true }),
    ...validateString(settings, "jointStateTopic"),
    ...validateBoolean(settings, "showAxes"),
    ...validateString(settings, "description", { allowEmpty: true }),
  ];
  if (
    settings.modelSource === "urdf-url" &&
    typeof settings.robotModelUrl === "string" &&
    !settings.robotModelUrl.trim()
  ) {
    errors.push({ field: "robotModelUrl", message: "robotModelUrl is required when modelSource is urdf-url" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as Robot3dSettings);
}

function validateUnknownSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<UnknownWidgetSettings> {
  if (!isJsonSerializable(settings)) {
    return fail([{ field: "settings", message: "settings must be JSON serializable" }]);
  }
  return succeed(settings);
}

function validateJoystickLabels(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "labels", message: "labels must be an object" }];
  }
  return ["bottom", "left", "right", "top"].flatMap((key) =>
    typeof value[key] === "string" ? [] : [{ field: `labels.${key}`, message: `${key} label must be a string` }],
  );
}

function validateJoystickAxisHints(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "axis_hints", message: "axis_hints must be an object" }];
  }

  return ["x", "y"].flatMap((axis) => validateJoystickAxisHint(value[axis], `axis_hints.${axis}`));
}

function validateJoystickAxisHint(value: unknown, field: string): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field, message: `${field} must be an object` }];
  }

  const errors: WidgetSettingsValidationError[] = [];
  for (const key of ["color", "negative_label", "positive_label"]) {
    if (typeof value[key] !== "string" || value[key].trim().length === 0) {
      errors.push({ field: `${field}.${key}`, message: `${key} must be a non-empty string` });
    }
  }
  if (
    typeof value.semantic !== "string" ||
    !["custom", "rotation", "translation", "vertical"].includes(value.semantic)
  ) {
    errors.push({
      field: `${field}.semantic`,
      message: "semantic must be one of: custom, rotation, translation, vertical",
    });
  }
  return errors;
}

function validateJoystickRuntimeBinding(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "runtime_binding", message: "runtime_binding must be an object" }];
  }

  const errors: WidgetSettingsValidationError[] = [];
  if (typeof value.adapter !== "string" || !["custom", "teleop", "topic"].includes(value.adapter)) {
    errors.push({ field: "runtime_binding.adapter", message: "adapter must be one of: custom, teleop, topic" });
  }
  if (typeof value.target !== "string" || value.target.trim().length === 0) {
    errors.push({ field: "runtime_binding.target", message: "target is required" });
  }
  if (
    "value_mapping" in value &&
    value.value_mapping !== undefined &&
    (!isRecord(value.value_mapping) || !isJsonSerializable(value.value_mapping))
  ) {
    errors.push({ field: "runtime_binding.value_mapping", message: "value_mapping must be a JSON object" });
  }
  return errors;
}

function validateBoolean(settings: Record<string, unknown>, field: string): WidgetSettingsValidationError[] {
  return typeof settings[field] === "boolean" ? [] : [{ field, message: `${field} must be a boolean` }];
}

function validateNumber(
  settings: Record<string, unknown>,
  field: string,
  options: { max?: number; min?: number } = {},
): WidgetSettingsValidationError[] {
  const value = settings[field];
  if (!isNumber(value)) {
    return [{ field, message: `${field} must be a number` }];
  }
  if (options.min !== undefined && value < options.min) {
    return [{ field, message: `${field} must be greater than or equal to ${options.min}` }];
  }
  if (options.max !== undefined && value > options.max) {
    return [{ field, message: `${field} must be less than or equal to ${options.max}` }];
  }
  return [];
}

function validateNumberArray(value: unknown, field: string): WidgetSettingsValidationError[] {
  if (!Array.isArray(value)) {
    return [{ field, message: `${field} must be an array` }];
  }
  return value.every((candidate) => typeof candidate === "number" && Number.isFinite(candidate))
    ? []
    : [{ field, message: `${field} must contain only finite numbers` }];
}

function validateOneOf(
  settings: Record<string, unknown>,
  field: string,
  options: string[],
): WidgetSettingsValidationError[] {
  return typeof settings[field] === "string" && options.includes(settings[field])
    ? []
    : [{ field, message: `${field} must be one of: ${options.join(", ")}` }];
}

function validateString(
  settings: Record<string, unknown>,
  field: string,
  options: { allowEmpty?: boolean } = {},
): WidgetSettingsValidationError[] {
  const value = settings[field];
  if (typeof value !== "string") {
    return [{ field, message: `${field} must be a string` }];
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    return [{ field, message: `${field} is required` }];
  }
  return [];
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSameJson(left: unknown, right: unknown): boolean {
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => isSameJson(left[key], right[key]));
  }
  return left === right;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((candidate) => typeof candidate === "string");
}

function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function cloneSettings<TSettings extends Record<string, unknown>>(settings: TSettings): TSettings {
  return JSON.parse(JSON.stringify(settings)) as TSettings;
}

function succeed<TSettings extends Record<string, unknown>>(
  settings: TSettings,
): WidgetSettingsValidationResult<TSettings> {
  return {
    success: true,
    settings,
  };
}

function fail(errors: WidgetSettingsValidationError[]): WidgetSettingsValidationResult<never> {
  return {
    success: false,
    errors,
  };
}
