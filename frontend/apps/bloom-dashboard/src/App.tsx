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
import { useConfigurations } from "./configurations/use-configurations";
import { RuntimeWorkspace } from "./runtime/RuntimeWorkspace";
import type { RuntimeActionClient } from "./runtime/runtime-action-dispatcher";
import { useRuntimeActionDispatcher } from "./runtime/use-runtime-action-dispatcher";
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

  return (
    <BloomThemeProvider theme={BLOOM_THEME_PRESETS.bloom}>
      <main className={`app-shell app-shell-${activeView}`} id="bloom-main">
        <ProductNavigation activeView={activeView} onChangeView={setActiveView} />

        {activeView === "landing" ? (
          <LandingPage onOpenView={setActiveView} />
        ) : (
          <MainApplicationView
            activeView={activeView}
            onRuntimeIntent={handleRuntimeIntent}
            onSelectionChange={setSelection}
            selection={selection}
            state={configurationState}
          />
        )}
      </main>
    </BloomThemeProvider>
  );
}

type MainApplicationViewProps = {
  activeView: Exclude<ProductView, "landing">;
  onRuntimeIntent: (intent: WidgetActionIntent) => void;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection | null;
  state: ReturnType<typeof useConfigurations>;
};

function MainApplicationView({
  activeView,
  onRuntimeIntent,
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
