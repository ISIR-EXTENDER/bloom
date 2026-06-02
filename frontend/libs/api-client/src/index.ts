export type WidgetKind =
  | "button"
  | "camera"
  | "command-button"
  | "gauge"
  | "joystick"
  | "label"
  | "plot"
  | "slider"
  | "toggle"
  | "unknown";

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

export type ApplicationConfig = {
  id: string;
  name: string;
  description: string;
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

  async deleteConfiguration(configId: string): Promise<void> {
    await this.request<void>(`/api/v1/configurations/${encodeURIComponent(configId)}`, {
      method: "DELETE",
    });
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
