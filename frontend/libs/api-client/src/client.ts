import type {
  ApplicationConfig,
  ApplicationListResponse,
  ConfigurationBundle,
  ConfigurationListResponse,
  ReusableScreen,
  ReusableScreensResponse,
  RobotModelResponse,
  RosParameterReading,
  RosParameterSetRequest,
  RosParameterSetResponse,
  RosServiceCallRequest,
  RosServiceCallResponse,
  RosTopicInfo,
  RosTopicListResponse,
  RosTopicPublishRequest,
  RosTopicPublishResponse,
  RosTopicStatus,
  RosTopicStatusListResponse,
  RuntimeActionDispatchRequest,
  RuntimeActionDispatchResponse,
  RuntimeAuditListResponse,
  RuntimeAuditRecord,
  RuntimeCapabilitiesResponse,
  RuntimeCapabilityReport,
  RuntimeControlState,
  RuntimeRecordingResponse,
  RuntimeRecordingStartRequest,
  RuntimeStopState,
  SavedPosition,
  SavedPositionExportResponse,
  SavedPositionListResponse,
  SavedPositionScope,
  ScreenConfig,
  ThemeAssetUploadRequest,
  ThemeAssetUploadResponse,
} from "./types";

export type BloomApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  getRequestHeaders?: () => HeadersInit;
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
  private readonly getRequestHeaders?: () => HeadersInit;

  constructor(options: BloomApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "");
    this.fetcher = options.fetcher ?? getDefaultFetcher();
    this.getRequestHeaders = options.getRequestHeaders;
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
  /** The running robot's description; an unchanged one answers 304 and costs nothing but the tag. */
  async readRobotModel(): Promise<RobotModelResponse> {
    const cached = this.robotModel;
    const response = await this.fetcher(
      `${this.baseUrl}/api/v1/ros/robot-model`,
      this.withRequestHeaders({ headers: cached ? { "If-None-Match": cached.etag } : {} }),
    );
    if (response.status === 304 && cached) {
      return cached.response;
    }
    if (!response.ok) {
      throw new BloomApiError(
        `Bloom API request failed with status ${response.status}`,
        response.status,
        await response.text(),
      );
    }
    const body = (await response.json()) as RobotModelResponse;
    const etag = response.headers.get("etag");
    this.robotModel = etag ? { etag, response: body } : null;
    return body;
  }

  /** A mesh the URDF names as package://<package>/<path>, or null when the API has none. */
  async readRobotModelAsset(packageName: string, assetPath: string): Promise<ArrayBuffer | null> {
    const path = assetPath.split("/").map(encodeURIComponent).join("/");
    const response = await this.fetcher(
      `${this.baseUrl}/api/v1/ros/robot-model/assets/${encodeURIComponent(packageName)}/${path}`,
      this.withRequestHeaders({}),
    );
    return response.ok ? response.arrayBuffer() : null;
  }

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

  async listSavedPositions(scope?: SavedPositionScope): Promise<SavedPosition[]> {
    const response = await this.request<SavedPositionListResponse>(
      `/api/v1/runtime/positions${savedPositionQuery(scope)}`,
    );
    return response.positions;
  }

  saveSavedPosition(request: SavedPosition, scope?: SavedPositionScope): Promise<SavedPosition> {
    return this.request<SavedPosition>(`/api/v1/runtime/positions${savedPositionQuery(scope)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  async deleteSavedPosition(name: string, scope?: SavedPositionScope): Promise<SavedPosition[]> {
    const response = await this.request<SavedPositionListResponse>(
      `/api/v1/runtime/positions/${encodeURIComponent(name)}${savedPositionQuery(scope)}`,
      { method: "DELETE" },
    );
    return response.positions;
  }

  exportSavedPositions(scope?: SavedPositionScope): Promise<SavedPositionExportResponse> {
    return this.request<SavedPositionExportResponse>(`/api/v1/runtime/positions/export${savedPositionQuery(scope)}`);
  }

  setRosParameter(request: RosParameterSetRequest): Promise<RosParameterSetResponse> {
    return this.request<RosParameterSetResponse>("/api/v1/ros/parameters/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  async getRosParameters(node: string, names: readonly string[]): Promise<RosParameterReading[]> {
    const query = `node=${encodeURIComponent(node)}&names=${encodeURIComponent(names.join(","))}`;
    const response = await this.request<{ parameters: RosParameterReading[] }>(`/api/v1/ros/parameters?${query}`);
    return response.parameters;
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

  getRuntimeControlState(): Promise<RuntimeControlState> {
    return this.request<RuntimeControlState>("/api/v1/runtime/control");
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

  private robotModel: { etag: string; response: RobotModelResponse } | null = null;

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, this.withRequestHeaders(init));
    if (!response.ok) {
      const responseText = await response.text();
      throw new BloomApiError(`Bloom API request failed with status ${response.status}`, response.status, responseText);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private withRequestHeaders(init: RequestInit): RequestInit {
    if (!this.getRequestHeaders) {
      return init;
    }

    const headers = new Headers(this.getRequestHeaders());
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    return { ...init, headers };
  }
}

export function createBloomApiClient(options: BloomApiClientOptions = {}): BloomApiClient {
  return new BloomApiClient(options);
}

function savedPositionQuery(scope?: SavedPositionScope): string {
  if (!scope?.appId && !scope?.configId) {
    return "";
  }
  const query = new URLSearchParams({ app_id: scope.appId, config_id: scope.configId });
  return `?${query.toString()}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function getDefaultFetcher(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}
