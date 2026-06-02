import type { WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useState } from "react";
import "./App.css";

import { type ConfigurationClient, createDashboardConfigurationClient } from "./configurations/configuration-client";
import { useConfigurations } from "./configurations/use-configurations";
import { CanvasPreview } from "./ui/CanvasPreview";
import {
  ConfigurationWorkspace,
  getInitialWorkspaceSelection,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "./ui/ConfigurationWorkspace";
import { LandingPage } from "./ui/LandingPage";
import { ProductNavigation, type ProductView } from "./ui/ProductNavigation";
import { RuntimeIntentPanel } from "./ui/RuntimeIntentPanel";

const defaultConfigurationClient = createDashboardConfigurationClient();

type AppProps = {
  configurationClient?: ConfigurationClient;
};

export function App({ configurationClient = defaultConfigurationClient }: AppProps) {
  const configurationState = useConfigurations(configurationClient);
  const [activeView, setActiveView] = useState<ProductView>("landing");
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const [runtimeIntents, setRuntimeIntents] = useState<WidgetActionIntent[]>([]);

  useEffect(() => {
    if (configurationState.status !== "ready" || selection) {
      return;
    }
    setSelection(getInitialWorkspaceSelection(configurationState.configurations));
  }, [configurationState, selection]);

  const handleRuntimeIntent = (intent: WidgetActionIntent) => {
    setRuntimeIntents((currentIntents) => [intent, ...currentIntents].slice(0, 6));
  };

  return (
    <main className="app-shell" id="bloom-main">
      <ProductNavigation activeView={activeView} onChangeView={setActiveView} />

      {activeView === "landing" ? (
        <LandingPage onOpenView={setActiveView} />
      ) : (
        <MainApplicationView
          activeView={activeView}
          onRuntimeIntent={handleRuntimeIntent}
          onSelectionChange={setSelection}
          runtimeIntents={runtimeIntents}
          selection={selection}
          state={configurationState}
        />
      )}
    </main>
  );
}

type MainApplicationViewProps = {
  activeView: Exclude<ProductView, "landing">;
  onRuntimeIntent: (intent: WidgetActionIntent) => void;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  runtimeIntents: readonly WidgetActionIntent[];
  selection: WorkspaceSelection | null;
  state: ReturnType<typeof useConfigurations>;
};

function MainApplicationView({
  activeView,
  onRuntimeIntent,
  onSelectionChange,
  runtimeIntents,
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

  return (
    <section className="main-application-grid" aria-label="Bloom main application">
      <ConfigurationWorkspace
        configurations={state.configurations}
        onSelectionChange={onSelectionChange}
        selection={selection}
      />
      <CanvasPreview
        mode={activeView}
        onActionIntent={activeView === "runtime" ? onRuntimeIntent : undefined}
        screen={selectedWorkspace.screen}
      />
      {activeView === "runtime" ? <RuntimeIntentPanel intents={runtimeIntents} /> : null}
    </section>
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
