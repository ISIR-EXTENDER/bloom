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
  settings: Record<string, unknown>;
};

export type ScreenConfig = {
  id: string;
  title: string;
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
    this.fetcher = options.fetcher ?? fetch;
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

