import type { WidgetKind } from "@bloom/api-client";

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
  source: "placeholder" | "stream-url" | "webcam";
  streamUrl: string;
  webcamPicker: boolean;
};

export type CommandActionFeedbackMode = "none" | "progress" | "result";

export type CommandButtonSettings = {
  action_feedback: CommandActionFeedbackMode;
  action_id: string;
  action_label: string;
  button_label: string;
  cancellable: boolean;
  command: string;
  messageType?: string;
  payload?: unknown;
  presetId?: string;
  topic?: string;
};

export type EventLogSettings = {
  entries: unknown[];
  maxEntries: number;
  severityFilter: string[];
  show_details: boolean;
  showTimestamps: boolean;
};

export type GaugeSettings = {
  max: number;
  min: number;
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
  historySeconds: number;
  samples: number[];
  showLegend: boolean;
  unit: string;
  variant: "area" | "bars" | "sparkline";
  yMax?: number;
  yMin?: number;
};

export type SliderSettings = {
  binding?: string;
  direction: "horizontal" | "vertical";
  max: number;
  messageType?: string;
  min: number;
  returnToCenter: boolean;
  runtime_binding?: JoystickRuntimeBinding;
  show_details: boolean;
  step: number;
  topic?: string;
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
  webcamPicker: true,
};

const COMMAND_BUTTON_DEFAULT_SETTINGS: CommandButtonSettings = {
  action_feedback: "none",
  action_id: "",
  action_label: "",
  button_label: "",
  cancellable: false,
  command: "",
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
  maxEntries: 20,
  severityFilter: ["info", "warning", "error", "success"],
  show_details: false,
  showTimestamps: true,
};

const GAUGE_DEFAULT_SETTINGS: GaugeSettings = {
  max: 1,
  min: 0,
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
      color: "#7fa95f",
      negative_label: "X-",
      positive_label: "X+",
      semantic: "translation",
    },
    y: {
      color: "#d89f5d",
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
      target_topic: "/teleop_cmd",
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
  historySeconds: 10,
  samples: [0.18, 0.34, 0.28, 0.52, 0.47, 0.68, 0.61, 0.79, 0.73, 0.88],
  showLegend: true,
  unit: "",
  variant: "area",
};

const SLIDER_DEFAULT_SETTINGS: SliderSettings = {
  direction: "vertical",
  max: 1,
  min: -1,
  returnToCenter: false,
  show_details: false,
  step: 0.01,
};

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
      {
        key: "source",
        label: "Source",
        type: "select",
        required: true,
        options: ["placeholder", "stream-url", "webcam"],
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
      {
        key: "action_feedback",
        label: "Action feedback",
        type: "select",
        required: true,
        options: ["none", "progress", "result"],
      },
      { key: "cancellable", label: "Cancellable", type: "boolean", required: true },
      { key: "topic", label: "Output topic", type: "text", required: false },
      { key: "messageType", label: "ROS message type", type: "text", required: false },
      { key: "payload", label: "Payload", type: "json", required: false },
      { key: "presetId", label: "Preset id", type: "text", required: false },
    ],
    COMMAND_BUTTON_DEFAULT_SETTINGS,
    validateCommandButtonSettings,
  ),
  "event-log": createContract(
    "event-log",
    [
      { key: "entries", label: "Entries", type: "json", required: true },
      { key: "maxEntries", label: "Maximum entries", type: "number", required: true },
      { key: "severityFilter", label: "Severity filter", type: "json", required: true },
      { key: "showTimestamps", label: "Show timestamps", type: "boolean", required: true },
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
      { key: "unit", label: "Unit", type: "text", required: false },
    ],
    GAUGE_DEFAULT_SETTINGS,
    validateGaugeSettings,
  ),
  "gesture-pad": createContract(
    "gesture-pad",
    [
      { key: "command", label: "Command", type: "text", required: true },
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
    ],
    LABEL_DEFAULT_SETTINGS,
    validateLabelSettings,
  ),
  plot: createContract(
    "plot",
    [
      { key: "historySeconds", label: "History duration", type: "number", required: true },
      { key: "showLegend", label: "Show legend", type: "boolean", required: true },
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
      { key: "returnToCenter", label: "Return to center", type: "boolean", required: true },
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
  "robot-3d": createContract(
    "robot-3d",
    [
      { key: "modelSource", label: "Model source", type: "select", required: true, options: ["extension", "urdf-url"] },
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
    return validateWidgetSettings(kind, normalizeJoystickCompatibility(mergedSettings));
  }
  if (kind === "camera") {
    return validateWidgetSettings(kind, normalizeCameraCompatibility(mergedSettings));
  }
  return validateWidgetSettings(kind, mergedSettings);
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
  command: string;
  messageType: string;
  payload: string;
  topic: string;
};

export const COMMON_ROS_MESSAGE_TYPES = [
  "std_msgs/msg/Bool",
  "std_msgs/msg/Float64",
  "std_msgs/msg/Int32",
  "std_msgs/msg/String",
  "std_msgs/msg/Int32MultiArray",
  "std_msgs/msg/UInt8MultiArray",
  "geometry_msgs/msg/Vector3",
] as const;

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
    command: "digital_output_on",
    messageType: "std_msgs/msg/Int32MultiArray",
    payload: "{data: [13, 1]}",
    topic: "/ui/ros_toggle",
  },
];

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
    ...validateOneOf(settings, "source", ["placeholder", "stream-url", "webcam"]),
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
  if (!isJsonSerializable(settings.payload)) {
    errors.push({ field: "payload", message: "payload must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CommandButtonSettings);
}

function validateEventLogSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<EventLogSettings> {
  const errors = [
    ...(Array.isArray(settings.entries) ? [] : [{ field: "entries", message: "entries must be an array" }]),
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

function normalizeJoystickCompatibility(settings: Record<string, unknown>): Record<string, unknown> {
  const binding = typeof settings.binding === "string" ? settings.binding : undefined;
  const defaults =
    binding === "rot" ? ROTATION_JOYSTICK_COMPATIBILITY_DEFAULTS : TRANSLATION_JOYSTICK_COMPATIBILITY_DEFAULTS;
  const usesDefaultMode = settings.mode_id === JOYSTICK_DEFAULT_SETTINGS.mode_id;
  const usesDefaultRuntimeBinding =
    isRecord(settings.runtime_binding) &&
    settings.runtime_binding.adapter === JOYSTICK_DEFAULT_SETTINGS.runtime_binding.adapter &&
    settings.runtime_binding.target === JOYSTICK_DEFAULT_SETTINGS.runtime_binding.target;
  const axisHints = isRecord(settings.axis_hints)
    ? {
        x: {
          ...defaults.axis_hints.x,
          ...(isRecord(settings.axis_hints.x) ? settings.axis_hints.x : {}),
        },
        y: {
          ...defaults.axis_hints.y,
          ...(isRecord(settings.axis_hints.y) ? settings.axis_hints.y : {}),
        },
      }
    : defaults.axis_hints;

  return {
    ...settings,
    axis_hints: axisHints,
    labels: isRecord(settings.labels) ? settings.labels : defaults.labels,
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
      color: "#95a5c8",
      negative_label: "RX-",
      positive_label: "RX+",
      semantic: "rotation",
    },
    y: {
      color: "#c8a3cf",
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
    ...validateNumber(settings, "publish_rate_hz", { min: 1, max: 120 }),
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
    ...validateNumber(settings, "historySeconds", { min: 1 }),
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
    ...validateOneOf(settings, "direction", ["horizontal", "vertical"]),
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
