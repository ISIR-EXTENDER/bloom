export const WIDGET_KINDS = [
  "button",
  "camera",
  "command-button",
  "event-log",
  "gauge",
  "gesture-pad",
  "joystick",
  "label",
  "plot",
  "position-library",
  "robot-3d",
  "slider",
  "toggle",
  "topic-echo",
  "topic-plot",
  "unknown",
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

export type CanvasPresetId =
  | "native-1024x600"
  | "native-1280x720"
  | "hd"
  | "tablet"
  | "wide-tablet"
  | "full-hd"
  | "local-screen";

export type RuntimeCanvasMode = "left" | "center" | "fit" | "operator-fit";

export type CanvasSettings = {
  preset_id: CanvasPresetId;
  runtime_mode: RuntimeCanvasMode;
};

export type ScreenConfig = {
  id: string;
  title: string;
  canvas: CanvasSettings;
  widgets: WidgetConfig[];
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
  | "reduced-motion"
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
};

export type RuntimeAdapterPolicy = {
  /** Shared rotation frame for every Cartesian command; empty uses the backend default. */
  command_frame_id?: string;
  allowed_message_types: string[];
  allowed_publish_topics: string[];
  allowed_recording_topics: string[];
  /** Trigger-style ROS services this app may call. */
  allowed_service_calls?: string[];
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
  allowed_publish_topics: [],
  allowed_recording_topics: [],
  allowed_teleop_targets: [],
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

export type RosTopicPublishRequest = {
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

export type RuntimeCapabilitiesResponse = {
  capabilities: RuntimeCapability[];
  command_frame_id: string;
  /** Frames cartesian_manager accepts as rotation references. */
  command_frame_ids?: string[];
  /** Which arm this backend drives; empty when the deployment has not said. */
  robot_name?: string;
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

export type SavedPositionListResponse = {
  positions: SavedPosition[];
};

export type SavedPositionExportResponse = {
  /** The joint_targets block to paste into the manager's parameters. */
  yaml: string;
  target_names: string[];
};

export type RosServiceCallRequest = {
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
};

export type BloomApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class BloomApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseText: string,
  ) {
    super(message);
    this.name = "BloomApiError";
  }
}

export class BloomApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: BloomApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "");
    this.fetcher = options.fetcher ?? getDefaultFetcher();
  }

  async listConfigurations(): Promise<string[]> {
    const response = await this.request<ConfigurationListResponse>("/api/v1/configurations");
    return response.configuration_ids;
  }

  getConfiguration(configId: string): Promise<ConfigurationBundle> {
    return this.request<ConfigurationBundle>(`/api/v1/configurations/${encodeURIComponent(configId)}`);
  }

  upsertConfiguration(configId: string, bundle: ConfigurationBundle): Promise<ConfigurationBundle> {
    return this.request<ConfigurationBundle>(`/api/v1/configurations/${encodeURIComponent(configId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    });
  }

  async listApplications(configId: string): Promise<ApplicationConfig[]> {
    const response = await this.request<ApplicationListResponse>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/applications`,
    );
    return response.applications;
  }

  upsertApplication(configId: string, application: ApplicationConfig): Promise<ConfigurationBundle> {
    return this.request<ConfigurationBundle>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/applications/${encodeURIComponent(application.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(application),
      },
    );
  }

  async deleteApplication(configId: string, applicationId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/applications/${encodeURIComponent(applicationId)}`,
      { method: "DELETE" },
    );
  }

  async listReusableScreens(configId: string): Promise<ReusableScreen[]> {
    const response = await this.request<ReusableScreensResponse>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/screens`,
    );
    return response.screens;
  }

  upsertScreen(configId: string, applicationId: string, screen: ScreenConfig): Promise<ConfigurationBundle> {
    return this.request<ConfigurationBundle>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/applications/${encodeURIComponent(
        applicationId,
      )}/screens/${encodeURIComponent(screen.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(screen),
      },
    );
  }

  async deleteScreen(configId: string, applicationId: string, screenId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/applications/${encodeURIComponent(
        applicationId,
      )}/screens/${encodeURIComponent(screenId)}`,
      { method: "DELETE" },
    );
  }

  async deleteConfiguration(configId: string): Promise<void> {
    await this.request<void>(`/api/v1/configurations/${encodeURIComponent(configId)}`, {
      method: "DELETE",
    });
  }

  uploadThemeAsset(configId: string, upload: ThemeAssetUploadRequest): Promise<ThemeAssetUploadResponse> {
    return this.request<ThemeAssetUploadResponse>(
      `/api/v1/configurations/${encodeURIComponent(configId)}/theme-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upload),
      },
    );
  }

  publishRosTopic(request: RosTopicPublishRequest): Promise<RosTopicPublishResponse> {
    return this.request<RosTopicPublishResponse>("/api/v1/ros/topics/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  dispatchRuntimeAction(request: RuntimeActionDispatchRequest): Promise<RuntimeActionDispatchResponse> {
    return this.request<RuntimeActionDispatchResponse>("/api/v1/runtime/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  /**
   * The backend seams that are really wired.
   *
   * Used by the builder to say what a widget can and cannot do here, instead of
   * offering everything and letting the ROS-dependent ones fail in silence.
   */
  async listRuntimeCapabilities(): Promise<RuntimeCapabilityReport> {
    return this.request<RuntimeCapabilitiesResponse>("/api/v1/capabilities");
  }

  async listRosTopics(): Promise<RosTopicInfo[]> {
    const response = await this.request<RosTopicListResponse>("/api/v1/ros/topics");
    return response.topics;
  }

  async listRosTopicStatus(): Promise<RosTopicStatus[]> {
    const response = await this.request<RosTopicStatusListResponse>("/api/v1/ros/topics/status");
    return response.topics;
  }

  async listRuntimeAuditRecords(limit = 100): Promise<RuntimeAuditRecord[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const response = await this.request<RuntimeAuditListResponse>(`/api/v1/runtime/audit?${params.toString()}`);
    return response.records;
  }

  startRuntimeRecording(request: RuntimeRecordingStartRequest): Promise<RuntimeRecordingResponse> {
    return this.request<RuntimeRecordingResponse>("/api/v1/runtime/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  async listSavedPositions(): Promise<SavedPosition[]> {
    const response = await this.request<SavedPositionListResponse>("/api/v1/runtime/positions");
    return response.positions;
  }

  saveSavedPosition(request: SavedPosition): Promise<SavedPosition> {
    return this.request<SavedPosition>("/api/v1/runtime/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  async deleteSavedPosition(name: string): Promise<SavedPosition[]> {
    const response = await this.request<SavedPositionListResponse>(
      `/api/v1/runtime/positions/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    return response.positions;
  }

  exportSavedPositions(): Promise<SavedPositionExportResponse> {
    return this.request<SavedPositionExportResponse>("/api/v1/runtime/positions/export");
  }

  callRosService(request: RosServiceCallRequest): Promise<RosServiceCallResponse> {
    return this.request<RosServiceCallResponse>("/api/v1/ros/services/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  getRuntimeStopState(): Promise<RuntimeStopState> {
    return this.request<RuntimeStopState>("/api/v1/runtime/stop");
  }

  /** HTTP on purpose: STOP matters most when the WebSocket is what died. */
  engageRuntimeStop(): Promise<RuntimeStopState> {
    return this.request<RuntimeStopState>("/api/v1/runtime/stop", { method: "POST" });
  }

  resumeRuntimeStop(): Promise<RuntimeStopState> {
    return this.request<RuntimeStopState>("/api/v1/runtime/stop/resume", { method: "POST" });
  }

  stopRuntimeRecording(recordingId: string): Promise<RuntimeRecordingResponse> {
    return this.request<RuntimeRecordingResponse>(
      `/api/v1/runtime/recordings/${encodeURIComponent(recordingId)}/stop`,
      { method: "POST" },
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      const responseText = await response.text();
      throw new BloomApiError(`Bloom API request failed with status ${response.status}`, response.status, responseText);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

export function createBloomApiClient(options: BloomApiClientOptions = {}): BloomApiClient {
  return new BloomApiClient(options);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function getDefaultFetcher(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}
