import type { ApplicationConfig, ConfigurationBundle, ScreenConfig, ShareStatus } from "@bloom/api-client";
import { useCallback, useEffect, useState } from "react";
import { describeApiError } from "../ui/api-error";

import type { ConfigurationClient } from "./configuration-client";
import { type LoadedConfiguration, loadConfigurations } from "./configuration-loader";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

type SaveConfiguration = (configId: string, bundle: ConfigurationBundle) => Promise<LoadedConfiguration>;
type SaveApplication = (configId: string, application: ApplicationConfig) => Promise<LoadedConfiguration>;
type SaveScreen = (configId: string, applicationId: string, screen: ScreenConfig) => Promise<LoadedConfiguration>;
type DeleteApplication = (configId: string, applicationId: string) => Promise<LoadedConfiguration>;
type TakeShipped = (configId: string) => Promise<LoadedConfiguration>;
type Publish = (configId: string) => Promise<{ path: string; alreadyPublished: boolean; warnings: string[] }>;

export type ConfigurationLoadState =
  | { status: "loading" }
  | {
      status: "ready";
      configurations: LoadedConfiguration[];
      deleteApplication: DeleteApplication;
      saveApplication: SaveApplication;
      saveConfiguration: SaveConfiguration;
      saveScreen: SaveScreen;
      /** Where each configuration stands against the shipped one; empty until the server answers. */
      shareStatus: Record<string, ShareStatus>;
      takeShipped: TakeShipped;
      publish: Publish;
    }
  | { status: "error"; message: string };

const CONFIGURATION_RETRY_MS = 5000;

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

  const refreshShareStatus = useCallback(async () => {
    // Sharing is a courtesy on top of saving: a server, or a client, that cannot say leaves the badges off.
    let shareStatus: Record<string, ShareStatus> = {};
    try {
      shareStatus = await client.getShareStatus();
    } catch {
      return;
    }
    setState((currentState) => (currentState.status === "ready" ? { ...currentState, shareStatus } : currentState));
  }, [client]);

  const saveConfiguration = useCallback<SaveConfiguration>(
    async (configId, bundle) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertConfiguration(configId, bundle));
      const saved = updateSavedConfiguration(configId, savedBundle);
      void refreshShareStatus();
      return saved;
    },
    [client, refreshShareStatus, updateSavedConfiguration],
  );

  const saveApplication = useCallback<SaveApplication>(
    async (configId, application) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertApplication(configId, application));
      const saved = updateSavedConfiguration(configId, savedBundle);
      void refreshShareStatus();
      return saved;
    },
    [client, refreshShareStatus, updateSavedConfiguration],
  );

  const saveScreen = useCallback<SaveScreen>(
    async (configId, applicationId, screen) => {
      const savedBundle = normalizeConfigurationBundle(await client.upsertScreen(configId, applicationId, screen));
      const saved = updateSavedConfiguration(configId, savedBundle);
      void refreshShareStatus();
      return saved;
    },
    [client, refreshShareStatus, updateSavedConfiguration],
  );

  const deleteApplication = useCallback<DeleteApplication>(
    async (configId, applicationId) => {
      await client.deleteApplication(configId, applicationId);

      const savedBundle = normalizeConfigurationBundle(await client.getConfiguration(configId));
      const saved = updateSavedConfiguration(configId, savedBundle);
      void refreshShareStatus();
      return saved;
    },
    [client, refreshShareStatus, updateSavedConfiguration],
  );

  const takeShipped = useCallback<TakeShipped>(
    async (configId) => {
      const savedBundle = normalizeConfigurationBundle(await client.takeShippedConfiguration(configId));
      const saved = updateSavedConfiguration(configId, savedBundle);
      await refreshShareStatus();
      return saved;
    },
    [client, refreshShareStatus, updateSavedConfiguration],
  );

  const publish = useCallback<Publish>(
    async (configId) => {
      const response = await client.publishConfiguration(configId);
      await refreshShareStatus();
      return { alreadyPublished: response.already_published, path: response.path, warnings: response.warnings ?? [] };
    },
    [client, refreshShareStatus],
  );

  // An API that is not up yet (a tablet booted before the robot PC) is retried rather than left as a dead end.
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    if (loadAttempt === 0) {
      setState({ status: "loading" });
    }

    loadConfigurations(client)
      .then((configurations) => {
        if (isCurrent) {
          setState({
            status: "ready",
            configurations,
            deleteApplication,
            saveApplication,
            saveConfiguration,
            saveScreen,
            shareStatus: {},
            takeShipped,
            publish,
          });
          void refreshShareStatus();
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({
            status: "error",
            message: `${describeApiError(error, "Bloom could not load configurations.")} Trying again every ${CONFIGURATION_RETRY_MS / 1000} s.`,
          });
          retry = setTimeout(() => setLoadAttempt((attempt) => attempt + 1), CONFIGURATION_RETRY_MS);
        }
      });

    return () => {
      isCurrent = false;
      clearTimeout(retry);
    };
  }, [
    loadAttempt,
    client,
    deleteApplication,
    saveApplication,
    saveConfiguration,
    saveScreen,
    takeShipped,
    publish,
    refreshShareStatus,
  ]);

  return state;
}
