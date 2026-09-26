import type { ConfigurationBundle } from "@bloom/api-client";

import type { ConfigurationClient } from "./configuration-client";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

export type LoadedConfiguration = {
  id: string;
  bundle: ConfigurationBundle;
};

export async function loadConfigurations(client: ConfigurationClient): Promise<LoadedConfiguration[]> {
  const configurationIds = await client.listConfigurations();
  const results = await Promise.allSettled(
    configurationIds.map(async (id) => ({
      id,
      bundle: normalizeConfigurationBundle(await client.getConfiguration(id)),
    })),
  );
  const loaded = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failed = results.flatMap((result, index) =>
    result.status === "rejected" ? [{ id: configurationIds[index], reason: result.reason }] : [],
  );
  // One unreadable app (a newer Bloom's, or a hand-edited file) used to fail every app with it.
  if (failed.length > 0 && loaded.length === 0) {
    throw failed[0]?.reason;
  }
  for (const { id, reason } of failed) {
    console.warn(`Bloom skipped configuration "${id}", which could not be read.`, reason);
  }
  return loaded;
}
