import { type BloomApiClient, createBloomApiClient } from "@bloom/api-client";
import type { RuntimeActionClient } from "../runtime/runtime-action-dispatcher";

export type ConfigurationClient = Pick<BloomApiClient, "getConfiguration" | "listConfigurations">;

export function createDashboardConfigurationClient(): ConfigurationClient {
  return createBloomApiClient({ baseUrl: getBloomApiBaseUrl() });
}

export function createDashboardRuntimeActionClient(): RuntimeActionClient {
  return createBloomApiClient({ baseUrl: getBloomApiBaseUrl() });
}

function getBloomApiBaseUrl(): string {
  return import.meta.env.VITE_BLOOM_API_URL ?? "";
}
