import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { type BloomRoute, builderModeRoute } from "../ui/navigationRoute";
import type { ConfigurationClient } from "./configuration-client";
import { duplicateApplicationInConfigurationBundle } from "./configuration-editor";
import type { ConfigurationLoadState } from "./use-configurations";

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
      if (!state.configurations.some((candidate) => candidate.id === configId)) {
        throw new Error(`Configuration "${configId}" was not found.`);
      }
      await state.saveApplication(configId, application);
      openInBuilder(configId, application);
    },

    async duplicateApplication(configId: string, applicationId: string) {
      const state = requireReady("duplicate an application");
      const configuration = state.configurations.find((candidate) => candidate.id === configId);
      if (!configuration) {
        throw new Error(`Configuration "${configId}" was not found.`);
      }
      const duplicated = duplicateApplicationInConfigurationBundle(configuration.bundle, applicationId);
      await state.saveApplication(configId, duplicated);
      openInBuilder(configId, duplicated);
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
