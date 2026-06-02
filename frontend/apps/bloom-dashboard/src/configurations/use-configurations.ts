import type { ConfigurationBundle } from "@bloom/api-client";
import { useCallback, useEffect, useState } from "react";

import type { ConfigurationClient } from "./configuration-client";
import { type LoadedConfiguration, loadConfigurations } from "./configuration-loader";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

type SaveConfiguration = (configId: string, bundle: ConfigurationBundle) => Promise<LoadedConfiguration>;

export type ConfigurationLoadState =
  | { status: "loading" }
  | { status: "ready"; configurations: LoadedConfiguration[]; saveConfiguration: SaveConfiguration }
  | { status: "error"; message: string };

export function useConfigurations(client: ConfigurationClient): ConfigurationLoadState {
  const [state, setState] = useState<ConfigurationLoadState>({ status: "loading" });

  const saveConfiguration = useCallback<SaveConfiguration>(
    async (configId, bundle) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertConfiguration(configId, bundle));
      const savedConfiguration = { id: configId, bundle: savedBundle };

      setState((currentState) => {
        if (currentState.status !== "ready") {
          return currentState;
        }

        return {
          ...currentState,
          configurations: currentState.configurations.map((configuration) =>
            configuration.id === configId ? savedConfiguration : configuration,
          ),
        };
      });

      return savedConfiguration;
    },
    [client],
  );

  useEffect(() => {
    let isCurrent = true;
    setState({ status: "loading" });

    loadConfigurations(client)
      .then((configurations) => {
        if (isCurrent) {
          setState({ status: "ready", configurations, saveConfiguration });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({ status: "error", message: getErrorMessage(error) });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [client, saveConfiguration]);

  return state;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom could not load configurations.";
}
