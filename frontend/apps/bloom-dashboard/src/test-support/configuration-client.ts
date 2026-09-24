import type { ConfigurationBundle } from "@bloom/api-client";
import { vi } from "vitest";
import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";

/** A configuration client serving one seeded bundle, as the runtime tests need: reads, and writes that echo. */
export function seededConfigurationClient(
  configId: string,
  seed: unknown,
  prepare?: (bundle: ConfigurationBundle) => void,
) {
  const bundle = structuredClone(seed) as ConfigurationBundle;
  prepare?.(bundle);
  return {
    listConfigurations: vi.fn(async () => [configId]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
    upsertApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    deleteApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
  } as never;
}

export function explorerManagerClient(prepare?: (bundle: ConfigurationBundle) => void) {
  return seededConfigurationClient("explorer-manager", explorerManagerConfiguration, prepare);
}
