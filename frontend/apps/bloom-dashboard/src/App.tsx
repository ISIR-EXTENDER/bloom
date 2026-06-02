import type { ScreenConfig } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS, BloomThemeProvider } from "@bloom/ui";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useState } from "react";
import "./App.css";

import { BuilderWorkspace } from "./builder/BuilderWorkspace";
import {
  type ConfigurationClient,
  createDashboardConfigurationClient,
  createDashboardRuntimeActionClient,
} from "./configurations/configuration-client";
import { replaceScreenInConfigurationBundle } from "./configurations/configuration-editor";
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
    const updatedBundle = replaceScreenInConfigurationBundle(
      selectedWorkspace.bundle,
      selectedWorkspace.application.id,
      screen,
    );

    await configurationState.saveConfiguration(selectedWorkspace.configuration.id, updatedBundle);
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
              onRuntimeIntent={handleRuntimeIntent}
              onSaveBuilderScreen={handleSaveBuilderScreen}
              onSelectionChange={setSelection}
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
  onRuntimeIntent: (intent: WidgetActionIntent) => void;
  onSaveBuilderScreen: (screen: ScreenConfig) => Promise<void>;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection | null;
  state: ReturnType<typeof useConfigurations>;
};

function MainApplicationView({
  activeView,
  onRuntimeIntent,
  onSaveBuilderScreen,
  onSelectionChange,
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
    return (
      <BuilderWorkspace
        configurations={state.configurations}
        onSelectionChange={onSelectionChange}
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
