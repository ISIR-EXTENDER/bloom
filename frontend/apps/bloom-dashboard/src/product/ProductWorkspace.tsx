import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { BuilderAppConfig } from "../builder/BuilderAppConfig";
import { BuilderHome } from "../builder/BuilderHome";
import { BuilderWorkspace } from "../builder/BuilderWorkspace";
import type { useConfigurations } from "../configurations/use-configurations";
import { RuntimeHome } from "../runtime/RuntimeHome";
import { RuntimeWorkspace } from "../runtime/RuntimeWorkspace";
import type { RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import type { useRuntimeActionDispatcher } from "../runtime/use-runtime-action-dispatcher";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import type { ProductView } from "../ui/ProductNavigation";

export type BuilderMode = "app-config" | "home" | "screen-builder";
export type RuntimeMode = "app" | "home";

type ProductWorkspaceProps = {
  activeView: Exclude<ProductView, "landing">;
  builderMode: BuilderMode;
  onBackToRuntimeHome: () => void;
  onChangeBuilderMode: (mode: BuilderMode) => void;
  onCreateApplication: (configId: string, application: ApplicationConfig) => Promise<void>;
  onDeleteApplication: (configId: string, applicationId: string) => Promise<void>;
  onDuplicateApplication: (configId: string, applicationId: string) => Promise<void>;
  onEditRuntimeApplication: () => void;
  onEditRuntimeScreen: () => void;
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  onRuntimeIntent: (intent: WidgetActionIntent) => void;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  onSaveBuilderScreen: (screen: ScreenConfig) => Promise<void>;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onTopicSample: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest: ReturnType<typeof useRuntimeActionDispatcher>["subscribeTopic"];
  onUploadThemeAsset: (file: File) => Promise<string>;
  recentRuntimeSelections: readonly WorkspaceSelection[];
  runtimeMode: RuntimeMode;
  selection: WorkspaceSelection | null;
  state: ReturnType<typeof useConfigurations>;
};

export function ProductWorkspace({
  activeView,
  builderMode,
  onBackToRuntimeHome,
  onChangeBuilderMode,
  onCreateApplication,
  onDeleteApplication,
  onDuplicateApplication,
  onEditRuntimeApplication,
  onEditRuntimeScreen,
  onOpenRuntimeApp,
  onRuntimeIntent,
  onSaveApplication,
  onSaveBuilderScreen,
  onSelectionChange,
  onTopicSample,
  onTopicSubscriptionRequest,
  onUploadThemeAsset,
  recentRuntimeSelections,
  runtimeMode,
  selection,
  state,
}: ProductWorkspaceProps) {
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
      <BuilderProductWorkspace
        builderMode={builderMode}
        onChangeBuilderMode={onChangeBuilderMode}
        onCreateApplication={onCreateApplication}
        onDeleteApplication={onDeleteApplication}
        onDuplicateApplication={onDuplicateApplication}
        onOpenRuntimeApp={onOpenRuntimeApp}
        onSaveApplication={onSaveApplication}
        onSaveBuilderScreen={onSaveBuilderScreen}
        onSelectionChange={onSelectionChange}
        onUploadThemeAsset={onUploadThemeAsset}
        selection={selection}
        state={state}
      />
    );
  }

  if (runtimeMode === "home") {
    return (
      <RuntimeHome
        configurations={state.configurations}
        onOpenRuntimeApp={onOpenRuntimeApp}
        recentRuntimeSelections={recentRuntimeSelections}
      />
    );
  }

  return (
    <RuntimeWorkspace
      application={selectedWorkspace.application}
      onBackToRuntimeHome={onBackToRuntimeHome}
      onActionIntent={onRuntimeIntent}
      onEditApplication={onEditRuntimeApplication}
      onEditScreen={onEditRuntimeScreen}
      onSelectionChange={onSelectionChange}
      onTopicSample={onTopicSample}
      onTopicSubscriptionRequest={onTopicSubscriptionRequest}
      screen={selectedWorkspace.screen}
      selection={selection}
    />
  );
}

type BuilderProductWorkspaceProps = {
  builderMode: BuilderMode;
  onChangeBuilderMode: (mode: BuilderMode) => void;
  onCreateApplication: (configId: string, application: ApplicationConfig) => Promise<void>;
  onDeleteApplication: (configId: string, applicationId: string) => Promise<void>;
  onDuplicateApplication: (configId: string, applicationId: string) => Promise<void>;
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  onSaveBuilderScreen: (screen: ScreenConfig) => Promise<void>;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onUploadThemeAsset: (file: File) => Promise<string>;
  selection: WorkspaceSelection;
  state: Extract<ReturnType<typeof useConfigurations>, { status: "ready" }>;
};

function BuilderProductWorkspace({
  builderMode,
  onChangeBuilderMode,
  onCreateApplication,
  onDeleteApplication,
  onDuplicateApplication,
  onOpenRuntimeApp,
  onSaveApplication,
  onSaveBuilderScreen,
  onSelectionChange,
  onUploadThemeAsset,
  selection,
  state,
}: BuilderProductWorkspaceProps) {
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
          onOpenRuntimeApp(nextSelection);
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
        onUploadThemeAsset={onUploadThemeAsset}
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
