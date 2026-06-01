import { createBloomApiClient, type BloomApiClient } from "@bloom/api-client";

export type ConfigurationClient = Pick<BloomApiClient, "getConfiguration" | "listConfigurations">;

export function createDashboardConfigurationClient(): ConfigurationClient {
  return createBloomApiClient({ baseUrl: getBloomApiBaseUrl() });
}

function getBloomApiBaseUrl(): string {
  return import.meta.env.VITE_BLOOM_API_URL ?? "";
}
