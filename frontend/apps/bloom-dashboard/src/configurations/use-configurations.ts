import type { ApplicationConfig, ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { useCallback, useEffect, useState } from "react";

import type { ConfigurationClient } from "./configuration-client";
import { type LoadedConfiguration, loadConfigurations } from "./configuration-loader";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

type SaveConfiguration = (configId: string, bundle: ConfigurationBundle) => Promise<LoadedConfiguration>;
type SaveApplication = (configId: string, application: ApplicationConfig) => Promise<LoadedConfiguration>;
type SaveScreen = (configId: string, applicationId: string, screen: ScreenConfig) => Promise<LoadedConfiguration>;

export type ConfigurationLoadState =
  | { status: "loading" }
  | {
      status: "ready";
      configurations: LoadedConfiguration[];
      saveApplication: SaveApplication;
      saveConfiguration: SaveConfiguration;
      saveScreen: SaveScreen;
    }
  | { status: "error"; message: string };

export function useConfigurations(client: ConfigurationClient): ConfigurationLoadState {
  const [state, setState] = useState<ConfigurationLoadState>({ status: "loading" });

  const updateSavedConfiguration = useCallback((configId: string, savedBundle: ConfigurationBundle) => {
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
  }, []);

  const saveConfiguration = useCallback<SaveConfiguration>(
    async (configId, bundle) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertConfiguration(configId, bundle));
      return updateSavedConfiguration(configId, savedBundle);
    },
    [client, updateSavedConfiguration],
  );

  const saveApplication = useCallback<SaveApplication>(
    async (configId, application) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertApplication(configId, application));
      return updateSavedConfiguration(configId, savedBundle);
    },
    [client, updateSavedConfiguration],
  );

  const saveScreen = useCallback<SaveScreen>(
    async (configId, applicationId, screen) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertScreen(configId, applicationId, screen));
      return updateSavedConfiguration(configId, savedBundle);
    },
    [client, updateSavedConfiguration],
  );

  useEffect(() => {
    let isCurrent = true;
    setState({ status: "loading" });

    loadConfigurations(client)
      .then((configurations) => {
        if (isCurrent) {
          setState({ status: "ready", configurations, saveApplication, saveConfiguration, saveScreen });
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
  }, [client, saveApplication, saveConfiguration, saveScreen]);

  return state;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom could not load configurations.";
}
