import {
  type ApplicationConfig,
  BloomApiError,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  type ScreenConfig,
} from "@bloom/api-client";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { type BloomRoute, builderModeRoute } from "../ui/navigationRoute";
import type { ConfigurationClient } from "./configuration-client";
import { createUniqueConfigId, duplicateApplicationInConfigurationBundle } from "./configuration-editor";
import type { ConfigurationLoadState } from "./use-configurations";

const MAX_CONFIG_ID_ATTEMPTS = 50;

type ApplicationActionsOptions = {
  configurationClient: ConfigurationClient;
  configurationState: ConfigurationLoadState;
  navigate: (route: BloomRoute) => void;
  selection: WorkspaceSelection | null;
  setSelection: (selection: WorkspaceSelection | null) => void;
};

/** The Builder's save, upload, create, duplicate and delete flows, and where each lands afterwards. */
export function createApplicationActions({
  configurationClient,
  configurationState,
  navigate,
  selection,
  setSelection,
}: ApplicationActionsOptions) {
  const requireReady = (action: string) => {
    if (configurationState.status !== "ready") {
      throw new Error(`Bloom cannot ${action} before configurations are loaded.`);
    }
    return configurationState;
  };

  const requireSelectedWorkspace = (detail: string) => {
    if (configurationState.status !== "ready" || !selection) {
      throw new Error(`Bloom cannot ${detail}.`);
    }
    return {
      state: configurationState,
      workspace: resolveSelectedWorkspace(configurationState.configurations, selection),
    };
  };

  // A new app gets its own file: added to an existing one, sharing it rewrote that (often shipped) file.
  const saveAsNewConfiguration = async (
    state: Extract<ConfigurationLoadState, { status: "ready" }>,
    configId: string,
    application: ApplicationConfig,
  ) =>
    state.saveConfiguration(configId, {
      metadata: {
        exported_at: new Date().toISOString(),
        schema_version: CURRENT_CONFIGURATION_SCHEMA_VERSION,
        source: "bloom-builder",
      },
      applications: [application],
    });

  // Loaded ids are only what this client saw; ask the server too. Another client can still take it between the two.
  const claimFreeConfigId = async (configId: string, knownIds: Iterable<string>) => {
    const taken = new Set(knownIds);
    let candidate = createUniqueConfigId(configId, taken);
    for (let attempt = 0; attempt < MAX_CONFIG_ID_ATTEMPTS; attempt += 1) {
      try {
        await configurationClient.getConfiguration(candidate);
      } catch (error) {
        if (error instanceof BloomApiError && error.status === 404) {
          return candidate;
        }
        throw error;
      }
      taken.add(candidate);
      candidate = createUniqueConfigId(configId, taken);
    }
    throw new Error(`Bloom could not find a free configuration id for "${configId}" on the server.`);
  };

  const openInBuilder = (configId: string, application: ApplicationConfig) => {
    setSelection({ configId, appId: application.id, screenId: application.screens[0]?.id ?? "main" });
    navigate(builderModeRoute("app-config"));
  };

  return {
    async saveScreen(screen: ScreenConfig) {
      const { state, workspace } = requireSelectedWorkspace("save before a configuration workspace is selected");
      await state.saveScreen(workspace.configuration.id, workspace.application.id, screen);
    },

    async saveApplication(application: ApplicationConfig) {
      const { state, workspace } = requireSelectedWorkspace("save before an application is selected");
      await state.saveApplication(workspace.configuration.id, application);
    },

    async uploadThemeAsset(file: File): Promise<string> {
      const { workspace } = requireSelectedWorkspace("upload a theme asset before an application is selected");
      const response = await configurationClient.uploadThemeAsset(workspace.configuration.id, {
        filename: file.name,
        content_type: file.type,
        content_base64: await readFileAsBase64(file),
      });
      return response.uri;
    },

    async createApplication(configId: string, application: ApplicationConfig) {
      const state = requireReady("create an application");
      if (state.configurations.some((candidate) => candidate.id === configId)) {
        await state.saveApplication(configId, application);
        openInBuilder(configId, application);
        return;
      }
      const freeConfigId = await claimFreeConfigId(configId, Object.keys(state.shareStatus));
      await saveAsNewConfiguration(state, freeConfigId, application);
      openInBuilder(freeConfigId, application);
    },

    async duplicateApplication(configId: string, applicationId: string) {
      const state = requireReady("duplicate an application");
      const configuration = state.configurations.find((candidate) => candidate.id === configId);
      if (!configuration) {
        throw new Error(`Configuration "${configId}" was not found.`);
      }
      const duplicated = duplicateApplicationInConfigurationBundle(
        configuration.bundle,
        applicationId,
        state.configurations.flatMap((candidate) => candidate.bundle.applications),
      );
      const copyConfigId = await claimFreeConfigId(duplicated.id, [
        ...state.configurations.map((candidate) => candidate.id),
        ...Object.keys(state.shareStatus),
      ]);
      await saveAsNewConfiguration(state, copyConfigId, duplicated);
      openInBuilder(copyConfigId, duplicated);
    },

    async deleteApplication(configId: string, applicationId: string) {
      const state = requireReady("delete an application");
      const saved = await state.deleteApplication(configId, applicationId);
      const nextApplication = saved.bundle.applications[0];
      const nextScreen = nextApplication?.screens[0];
      setSelection(
        nextApplication && nextScreen ? { configId, appId: nextApplication.id, screenId: nextScreen.id } : null,
      );
      navigate(builderModeRoute("home"));
    },
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Bloom could not read this theme asset."));
        return;
      }

      resolve(reader.result.split(",", 2)[1] ?? "");
    });
    reader.addEventListener("error", () => reject(new Error("Bloom could not read this theme asset.")));
    reader.readAsDataURL(file);
  });
}
