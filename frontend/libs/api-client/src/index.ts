export const WIDGET_KINDS = [
  "button",
  "camera",
  "command-button",
  "event-log",
  "gauge",
  "joystick",
  "label",
  "plot",
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

export type CanvasPresetId = "native-1024x600" | "hd" | "tablet" | "full-hd" | "local-screen";

export type RuntimeCanvasMode = "left" | "center" | "fit";

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

export type MotorAccessibilityPreset = "assisted-touch" | "default" | "large-targets" | "reduced-motion";

export type UserProfile = {
  id: string;
  name: string;
  display_preset: DisplayPreset;
  font_scale: number;
  app_theme_preset_id: string;
  preferred_control_layout_id: string;
  motor_accessibility_preset: MotorAccessibilityPreset;
};

export const DEFAULT_APPLICATION_THEME: ApplicationTheme = {
  inspiration: {
    moodboard_image_uri: "",
    reference_url: "",
  },
  preset_id: "bloom-default",
  palette: {
    accent: "#d9a441",
    background: "#f7f1e6",
    primary: "#7f967e",
    surface: "#fffdf7",
  },
};

export type ApplicationConfig = {
  id: string;
  name: string;
  description: string;
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

export type RosTopicInfo = {
  name: string;
  message_type: string;
};

export type RosTopicListResponse = {
  topics: RosTopicInfo[];
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

  async listRosTopics(): Promise<RosTopicInfo[]> {
    const response = await this.request<RosTopicListResponse>("/api/v1/ros/topics");
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
