import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS, BloomThemeProvider } from "@bloom/ui";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useState } from "react";
import "./App.css";

import { BuilderAppConfig } from "./builder/BuilderAppConfig";
import { BuilderHome } from "./builder/BuilderHome";
import { BuilderWorkspace } from "./builder/BuilderWorkspace";
import {
  type ConfigurationClient,
  createDashboardConfigurationClient,
  createDashboardRuntimeActionClient,
} from "./configurations/configuration-client";
import { duplicateApplicationInConfigurationBundle } from "./configurations/configuration-editor";
import { useConfigurations } from "./configurations/use-configurations";
import { RuntimeWorkspace } from "./runtime/RuntimeWorkspace";
import type { RuntimeActionClient } from "./runtime/runtime-action-dispatcher";
import { useRuntimeActionDispatcher } from "./runtime/use-runtime-action-dispatcher";
import { AppErrorBoundary } from "./ui/AppErrorBoundary";
import {
  getInitialWorkspaceSelection,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "./ui/ConfigurationWorkspace";
import { LandingPage } from "./ui/LandingPage";
import { ProductNavigation, type ProductView } from "./ui/ProductNavigation";

const defaultConfigurationClient = createDashboardConfigurationClient();
const defaultRuntimeActionClient = createDashboardRuntimeActionClient();

type BuilderMode = "app-config" | "home" | "screen-builder";

type AppProps = {
  configurationClient?: ConfigurationClient;
  runtimeActionClient?: RuntimeActionClient;
};

export function App({
  configurationClient = defaultConfigurationClient,
  runtimeActionClient = defaultRuntimeActionClient,
}: AppProps) {
  const configurationState = useConfigurations(configurationClient);
  const runtimeActions = useRuntimeActionDispatcher(runtimeActionClient);
  const [activeView, setActiveView] = useState<ProductView>("landing");
  const [builderMode, setBuilderMode] = useState<BuilderMode>("home");
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);

  useEffect(() => {
    if (configurationState.status !== "ready" || selection) {
      return;
    }
    setSelection(getInitialWorkspaceSelection(configurationState.configurations));
  }, [configurationState, selection]);

  const handleRuntimeIntent = (intent: WidgetActionIntent) => {
    runtimeActions.dispatch(intent);
  };

  const handleSaveBuilderScreen = async (screen: ScreenConfig) => {
    if (configurationState.status !== "ready" || !selection) {
      throw new Error("Bloom cannot save before a configuration workspace is selected.");
    }

    const selectedWorkspace = resolveSelectedWorkspace(configurationState.configurations, selection);
    await configurationState.saveScreen(selectedWorkspace.configuration.id, selectedWorkspace.application.id, screen);
  };

  const handleSaveApplication = async (application: ApplicationConfig) => {
    if (configurationState.status !== "ready" || !selection) {
      throw new Error("Bloom cannot save before an application is selected.");
    }

    const selectedWorkspace = resolveSelectedWorkspace(configurationState.configurations, selection);
    await configurationState.saveApplication(selectedWorkspace.configuration.id, application);
  };

  const handleCreateApplication = async (configId: string, application: ApplicationConfig) => {
    if (configurationState.status !== "ready") {
      throw new Error("Bloom cannot create an application before configurations are loaded.");
    }

    if (!configurationState.configurations.some((candidate) => candidate.id === configId)) {
      throw new Error(`Configuration "${configId}" was not found.`);
    }

    await configurationState.saveApplication(configId, application);
    setSelection({ configId, appId: application.id, screenId: application.screens[0]?.id ?? "main" });
    setBuilderMode("app-config");
  };

  const handleDuplicateApplication = async (configId: string, applicationId: string) => {
    if (configurationState.status !== "ready") {
      throw new Error("Bloom cannot duplicate an application before configurations are loaded.");
    }

    const configuration = configurationState.configurations.find((candidate) => candidate.id === configId);

    if (!configuration) {
      throw new Error(`Configuration "${configId}" was not found.`);
    }

    const duplicatedApplication = duplicateApplicationInConfigurationBundle(configuration.bundle, applicationId);
    await configurationState.saveApplication(configId, duplicatedApplication);
    setSelection({
      configId,
      appId: duplicatedApplication.id,
      screenId: duplicatedApplication.screens[0]?.id ?? "main",
    });
    setBuilderMode("app-config");
  };

  const handleDeleteApplication = async (configId: string, applicationId: string) => {
    if (configurationState.status !== "ready") {
      throw new Error("Bloom cannot delete an application before configurations are loaded.");
    }

    const savedConfiguration = await configurationState.deleteApplication(configId, applicationId);
    const nextApplication = savedConfiguration.bundle.applications[0];
    const nextScreen = nextApplication?.screens[0];

    if (!nextApplication || !nextScreen) {
      setSelection(null);
      setBuilderMode("home");
      return;
    }

    setSelection({ configId, appId: nextApplication.id, screenId: nextScreen.id });
    setBuilderMode("home");
  };

  return (
    <BloomThemeProvider theme={BLOOM_THEME_PRESETS.bloom}>
      <main className={`app-shell app-shell-${activeView}`} id="bloom-main">
        <ProductNavigation activeView={activeView} onChangeView={setActiveView} />

        <AppErrorBoundary resetKey={activeView}>
          {activeView === "landing" ? (
            <LandingPage onOpenView={setActiveView} />
          ) : (
            <MainApplicationView
              activeView={activeView}
              builderMode={builderMode}
              onChangeBuilderMode={setBuilderMode}
              onCreateApplication={handleCreateApplication}
              onDeleteApplication={handleDeleteApplication}
              onDuplicateApplication={handleDuplicateApplication}
              onRuntimeIntent={handleRuntimeIntent}
              onSaveApplication={handleSaveApplication}
              onSaveBuilderScreen={handleSaveBuilderScreen}
              onSelectionChange={setSelection}
              onViewChange={setActiveView}
              selection={selection}
              state={configurationState}
            />
          )}
        </AppErrorBoundary>
      </main>
    </BloomThemeProvider>
  );
}

type MainApplicationViewProps = {
  activeView: Exclude<ProductView, "landing">;
  builderMode: BuilderMode;
  onChangeBuilderMode: (mode: BuilderMode) => void;
  onCreateApplication: (configId: string, application: ApplicationConfig) => Promise<void>;
  onDeleteApplication: (configId: string, applicationId: string) => Promise<void>;
  onDuplicateApplication: (configId: string, applicationId: string) => Promise<void>;
  onRuntimeIntent: (intent: WidgetActionIntent) => void;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  onSaveBuilderScreen: (screen: ScreenConfig) => Promise<void>;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onViewChange: (view: ProductView) => void;
  selection: WorkspaceSelection | null;
  state: ReturnType<typeof useConfigurations>;
};

function MainApplicationView({
  activeView,
  builderMode,
  onChangeBuilderMode,
  onCreateApplication,
  onDeleteApplication,
  onDuplicateApplication,
  onRuntimeIntent,
  onSaveApplication,
  onSaveBuilderScreen,
  onSelectionChange,
  onViewChange,
  selection,
  state,
}: MainApplicationViewProps) {
  if (state.status === "loading") {
    return <ConfigurationStatus message="Loading configurations..." />;
  }

  if (state.status === "error") {
    return <ConfigurationStatus isError message={state.message} />;
  }

  if (state.configurations.length === 0 || !selection) {
    return <ConfigurationStatus message="No configurations found yet." />;
  }

  const selectedWorkspace = resolveSelectedWorkspace(state.configurations, selection);

  if (activeView === "builder") {
    if (builderMode === "home") {
      return (
        <BuilderHome
          configurations={state.configurations}
          onCreateApplication={onCreateApplication}
          onDeleteApplication={onDeleteApplication}
          onDuplicateApplication={onDuplicateApplication}
          onOpenApplication={(nextSelection) => {
            onSelectionChange(nextSelection);
            onChangeBuilderMode("app-config");
          }}
          onOpenScreenBuilder={(nextSelection) => {
            onSelectionChange(nextSelection);
            onChangeBuilderMode("screen-builder");
          }}
          onPreviewScreenRuntime={(nextSelection) => {
            onSelectionChange(nextSelection);
            onViewChange("runtime");
          }}
        />
      );
    }

    if (builderMode === "app-config") {
      return (
        <BuilderAppConfig
          configurations={state.configurations}
          onBackToHome={() => onChangeBuilderMode("home")}
          onOpenScreenBuilder={(nextSelection) => {
            onSelectionChange(nextSelection);
            onChangeBuilderMode("screen-builder");
          }}
          onSaveApplication={onSaveApplication}
          selection={selection}
        />
      );
    }

    return (
      <BuilderWorkspace
        configurations={state.configurations}
        onBackToAppConfig={() => onChangeBuilderMode("app-config")}
        onBackToBuilderHome={() => onChangeBuilderMode("home")}
        onSaveScreenDraft={onSaveBuilderScreen}
        selection={selection}
      />
    );
  }

  return (
    <RuntimeWorkspace
      application={selectedWorkspace.application}
      onActionIntent={onRuntimeIntent}
      onSelectionChange={onSelectionChange}
      screen={selectedWorkspace.screen}
      selection={selection}
    />
  );
}

type ConfigurationStatusProps = {
  isError?: boolean;
  message: string;
};

function ConfigurationStatus({ isError = false, message }: ConfigurationStatusProps) {
  return (
    <section className="configuration-panel" aria-labelledby="configuration-panel-title">
      <div>
        <p className="eyebrow">Live configuration</p>
        <h2 id="configuration-panel-title">Available interfaces</h2>
      </div>
      <p
        className={`configuration-status ${isError ? "configuration-status-error" : ""}`}
        role={isError ? "alert" : undefined}
      >
        {message}
      </p>
    </section>
  );
}
