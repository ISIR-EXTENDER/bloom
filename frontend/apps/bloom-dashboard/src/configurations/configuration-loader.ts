import type { ConfigurationBundle } from "@bloom/api-client";

import type { ConfigurationClient } from "./configuration-client";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

export type LoadedConfiguration = {
  id: string;
  bundle: ConfigurationBundle;
};

export async function loadConfigurations(client: ConfigurationClient): Promise<LoadedConfiguration[]> {
  const configurationIds = await client.listConfigurations();
  return Promise.all(
    configurationIds.map(async (id) => ({
      id,
      bundle: normalizeConfigurationBundle(await client.getConfiguration(id)),
    })),
  );
}
