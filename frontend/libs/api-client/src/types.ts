/** The wire types Bloom's API speaks, and the defaults a new app starts from. */

export const WIDGET_KINDS = [
  "camera",
  "command-button",
  "event-log",
  "gauge",
  "gesture-pad",
  "jacobian",
  "joint-table",
  "joystick",
  "label",
  "plot",
  "plot-board",
  "plot-picker",
  "position-library",
  "robot-3d",
  "slider",
  "toggle",
  "topic-echo",
  "topic-plot",
  "unknown",
  "value-strip",
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number];

export type WidgetConfig = {
  id: string;
  kind: WidgetKind;
  title: string;
  layout: WidgetLayout;
  settings: Record<string, unknown>;
};

export type WidgetLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const CANVAS_PRESET_IDS = [
  "native-1024x600",
  "native-1280x720",
  "hd",
  "tablet",
  "wide-tablet",
  "full-hd",
  "local-screen",
] as const;

export type CanvasPresetId = (typeof CANVAS_PRESET_IDS)[number];

export const RUNTIME_CANVAS_MODES = ["left", "center", "fit", "operator-fit"] as const;

export type RuntimeCanvasMode = (typeof RUNTIME_CANVAS_MODES)[number];

export function isCanvasPresetId(value: unknown): value is CanvasPresetId {
  return typeof value === "string" && (CANVAS_PRESET_IDS as readonly string[]).includes(value);
}

export function isRuntimeCanvasMode(value: unknown): value is RuntimeCanvasMode {
  return typeof value === "string" && (RUNTIME_CANVAS_MODES as readonly string[]).includes(value);
}

export type CanvasSettings = {
  preset_id: CanvasPresetId;
  runtime_mode: RuntimeCanvasMode;
};

/** A screen area the runtime draws chrome in, such as STOP; no widget may be placed there. */
/** Where a stored app stands against the one shipped in the repository. */
export type ShareStatus = "deleted" | "edited" | "local" | "missing" | "outdated" | "shared";

export type ShareStatusResponse = {
  statuses: Record<string, ShareStatus>;
};

export type PublishResponse = {
  path: string;
  already_published: boolean;
  /** Why a teammate may not see the app as it looks here, such as theme images kept on this machine. */
  warnings?: string[];
};

export type ReservedRegion = {
  id: string;
  owner: "runtime-chrome";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenConfig = {
  id: string;
  title: string;
  canvas: CanvasSettings;
  widgets: WidgetConfig[];
  reserved_regions?: ReservedRegion[];
};

export type ApplicationTheme = {
  inspiration: {
    moodboard_image_uri: string;
    reference_url: string;
  };
  preset_id: string;
  palette: {
    accent: string;
    background: string;
    primary: string;
    surface: string;
  };
};

export type DisplayPreset = "compact" | "comfort" | "default" | "high-visibility";
export type RuntimeLanguage = "en" | "es" | "fr";

export type MotorAccessibilityPreset =
  | "assisted-touch"
  | "default"
  | "dwell"
  | "large-targets"
  | "latch"
  | "scan"
  | "step";

export type UserProfile = {
  id: string;
  name: string;
  display_preset: DisplayPreset;
  font_scale: number;
  app_theme_preset_id: string;
  preferred_control_layout_id: string;
  motor_accessibility_preset: MotorAccessibilityPreset;
  language?: RuntimeLanguage;
  /** Tones for stop, link loss, and recovery; the operator watches the gripper. */
  audio_cues?: boolean;
  /** Per-axis dead zone; overrides the widget's own when above zero. */
  deadzone?: number;
  /** Ignore a repeated activation of the same control within this window. */
  repeat_guard_ms?: number;
  /** How long the scan highlight rests on each control. */
  scan_period_ms?: number;
  /** Allow pointer dwell alongside any motor preset, including scanning. */
  dwell_enabled?: boolean;
  /** How long a pointer must rest on a control before it activates. */
  dwell_ms?: number;
  /** A tap opens maintenance instead of the 1.5 s hold; for roles that are not driving. */
  menu_on_tap?: boolean;
};

export type RuntimeAdapterPolicy = {
  /** Shared rotation frame for every Cartesian command; empty uses the backend default. */
  command_frame_id?: string;
  allowed_message_types: string[];
  /** "<node>:<parameter>" pairs this app's controls may set live. */
  allowed_parameters?: string[];
  allowed_publish_topics: string[];
  allowed_recording_topics: string[];
  /** Trigger-style ROS services this app may call. */
  allowed_service_calls: string[];
  allowed_teleop_targets: string[];
};

export type RuntimeActionPreset = {
  id: string;
  name: string;
  kind: string;
  description: string;
  command: string;
  topic: string;
  message_type: string;
  payload: unknown;
  payload_text: string;
  tags: string[];
};

export const DEFAULT_RUNTIME_POLICY: RuntimeAdapterPolicy = {
  command_frame_id: "",
  allowed_message_types: [],
  allowed_parameters: [],
  allowed_publish_topics: [],
  allowed_recording_topics: [],
  allowed_service_calls: [],
  // In step with the backend model default. An app that says nothing gets the manager's own command
  // topic, so a screen authored here can drive the robot as soon as it is opened; an app that declares
  // an empty list still drives nothing. Kept identical so an app made through the API and one made in
  // the builder do not start life different.
  allowed_teleop_targets: ["/joystick_cartesian_command"],
};

export const DEFAULT_ACTION_PRESETS: RuntimeActionPreset[] = [];

export const DEFAULT_APPLICATION_THEME: ApplicationTheme = {
  inspiration: {
    moodboard_image_uri: "",
    reference_url: "",
  },
  // Kept in step with the backend model default in
  // backend/libs/config/models.py. The two used to disagree, so an app created
  // through the API and one created in the builder started life different.
  preset_id: "bloom-default",
  palette: {
    accent: "#d9a441",
    background: "#f7f1e6",
    primary: "#7f967e",
    surface: "#fffdf7",
  },
};

/**
 * Whether an application is being carried forward.
 *
 * `archived` means kept and still runnable, but not maintained against the
 * current robot architecture and not a release gate.
 */
export type ApplicationLifecycle = "active" | "archived";

export type ApplicationConfig = {
  id: string;
  name: string;
  description: string;
  lifecycle?: ApplicationLifecycle;
  action_presets: RuntimeActionPreset[];
  runtime_policy: RuntimeAdapterPolicy;
  theme: ApplicationTheme;
  profiles: UserProfile[];
  screens: ScreenConfig[];
};

export type ConfigurationMetadata = {
  schema_version: number;
  exported_at: string;
  source: string;
};

export const CURRENT_CONFIGURATION_SCHEMA_VERSION = 1;

export type ConfigurationBundle = {
  metadata: ConfigurationMetadata;
  applications: ApplicationConfig[];
};

export type ConfigurationListResponse = {
  configuration_ids: string[];
};

export type ApplicationListResponse = {
  applications: ApplicationConfig[];
};

export type ReusableScreen = {
  screen: ScreenConfig;
  source_application_id: string;
  source_application_name: string;
};

export type ReusableScreensResponse = {
  screens: ReusableScreen[];
};

export type ThemeAssetUploadRequest = {
  filename: string;
  content_type: string;
  content_base64: string;
};

export type ThemeAssetUploadResponse = {
  uri: string;
  content_type: string;
  byte_size: number;
};

export type RosTopicPublishStatus = "published" | "simulated";

/** The app a runtime widget belongs to: the backend then narrows the deployment's policy to that app's. */
export type AppScope = {
  config_id?: string;
  app_id?: string;
};

export type RosTopicPublishRequest = AppScope & {
  topic: string;
  message_type: string;
  payload?: Record<string, unknown>;
  payload_text?: string;
};

export type RosTopicPublishResponse = {
  topic: string;
  message_type: string;
  status: RosTopicPublishStatus;
  detail: string;
};

export type RuntimeActionDispatchRequest = {
  app_id: string;
  command?: string;
  config_id: string;
  preset_id?: string;
};

export type RuntimeActionDispatchResponse = {
  app_id: string;
  command: string;
  config_id: string;
  detail: string;
  message_type: string;
  preset_id: string;
  status: RosTopicPublishStatus | "called";
  topic: string;
};

export type RosTopicInfo = {
  name: string;
  message_type: string;
};

export type RosTopicStatus = RosTopicInfo & {
  publisher_count: number;
  subscription_count: number;
};

export type RosTopicListResponse = {
  topics: RosTopicInfo[];
};

export type RuntimeCapability = {
  id: string;
  available: boolean;
  detail: string;
};

export type RobotModelResponse = {
  node: string;
  status: "ready" | "unavailable";
  urdf: string | null;
};

export type RuntimeCapabilitiesResponse = {
  capabilities: RuntimeCapability[];
  command_frame_id: string;
  /** Frames cartesian_manager accepts as rotation references. */
  command_frame_ids?: string[];
  /** Which arm this backend drives; empty when the deployment has not said. */
  robot_name?: string;
  /** Topics this server lets a joystick drive; an app's own teleop list can only narrow it. */
  teleop_targets?: string[];
  /** The deployment's own allowlists; an app's lists can only narrow them. */
  allowed_ros_publish_topics?: string[];
  allowed_ros_message_types?: string[];
  allowed_ros_parameters?: string[];
  allowed_ros_service_calls?: string[];
};

/** Capabilities plus the frame operator commands are stamped with. */
export type RuntimeCapabilityReport = RuntimeCapabilitiesResponse;

export type RosTopicStatusListResponse = {
  topics: RosTopicStatus[];
};

export type RuntimeAuditRecord = {
  channel: string;
  detail: string;
  message_type: string;
  payload_summary: Record<string, unknown>;
  recorded_at: string;
  /** Identical records back to back, counted instead of stored again. */
  repeats?: number;
  session_id: string;
  status: string;
  target: string;
  topic: string;
};

export type RuntimeAuditListResponse = {
  records: RuntimeAuditRecord[];
};

export type RuntimeRecordingStartRequest = {
  label?: string;
  output_folder: string;
  topics: string[];
};

export type RuntimeRecordingResponse = {
  detail: string;
  output_folder: string;
  recording_id: string;
  status: "recording" | "simulated" | "stopped";
  topics: string[];
};

/** The runtime stop latch as the backend holds it; engaged_at empty while running. */
export type SavedPosition = {
  name: string;
  joint_names: string[];
  positions: number[];
  description: string;
};

/** Joint order belongs to one arm, so poses belong to one application. */
export type SavedPositionScope = {
  appId: string;
  configId: string;
};

export type SavedPositionListResponse = {
  positions: SavedPosition[];
};

export type SavedPositionExportResponse = {
  /** The joint_targets block to paste into the manager's parameters. */
  yaml: string;
  target_names: string[];
};

export type RosParameterValue = boolean | number | string;

export type RosParameterSetRequest = AppScope & {
  node: string;
  name: string;
  value: RosParameterValue;
};

export type RosParameterSetResponse = {
  node: string;
  name: string;
  value: RosParameterValue;
  status: "set" | "simulated";
  detail: string;
};

export type RosParameterReading = {
  node: string;
  name: string;
  value: RosParameterValue | null;
};

export type RosServiceCallRequest = AppScope & {
  service: string;
  service_type: string;
};

export type RosServiceCallResponse = {
  service: string;
  service_type: string;
  status: "called" | "simulated";
  success: boolean | null;
  detail: string;
};

export type RuntimeStopState = {
  stopped: boolean;
  /** True only when both the zero velocity and joint-target cancel reached ROS. */
  asserted: boolean;
  engaged_at: string;
  detail: string;
  /** True when an assertion was only simulated, so the robot was never told. */
  simulated?: boolean;
};

export type RuntimeControlState = {
  active_sessions: number;
  detail: string;
  is_owner: boolean;
  owner_present: boolean;
  session_id: string;
  /** What the controlling session is doing, as the backend sees it. */
  owner_frame_id?: string;
  owner_mode_request?: string;
  owner_moving?: boolean;
};
