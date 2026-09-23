import type { ApplicationConfig, RuntimeCapability, RuntimeCapabilityReport, ScreenConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler } from "@bloom/widget-renderers";
import type { WidgetActionIntent } from "@bloom/widgets";
import { BuilderAppConfig } from "../builder/BuilderAppConfig";
import { BuilderHome } from "../builder/BuilderHome";
import { BuilderWorkspace } from "../builder/BuilderWorkspace";
import type { useConfigurations } from "../configurations/use-configurations";
import { RuntimeHome } from "../runtime/RuntimeHome";
import { RuntimeWorkspace } from "../runtime/RuntimeWorkspace";
import type { RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import type { RuntimeProfileOverrides } from "../runtime/runtime-profile-overrides";
import type { RuntimeModeState } from "../runtime/runtimeModeState";
import { resolveInitialScreen } from "../runtime/runtimeProfile";
import { SupervisorWorkspace } from "../runtime/SupervisorWorkspace";
import type { SupervisorRuntimeClient } from "../runtime/supervisor-client";
import type { RuntimeActionFeedback, useRuntimeActionDispatcher } from "../runtime/use-runtime-action-dispatcher";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import type { ProductView } from "../ui/ProductNavigation";
import { runtimePreferenceKey } from "../ui/runtime-user-preferences";

export type BuilderMode = "app-config" | "home" | "screen-builder";
export type RuntimeMode = "app" | "home" | "supervisor";

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
  onOpenBuilderHome: () => void;
  onOpenHelp: () => void;
  onOpenLanding: () => void;
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  onOpenSupervisorApp: (selection: WorkspaceSelection) => void;
  onOpenSupervisorWindow: (selection: WorkspaceSelection) => void;
  onRuntimeProfilePreferenceChange: (
    selection: Pick<WorkspaceSelection, "appId" | "configId">,
    profileId: string,
  ) => void;
  onRuntimeProfileOverridesChange: (
    selection: Pick<WorkspaceSelection, "appId" | "configId">,
    profileId: string,
    overrides: RuntimeProfileOverrides,
  ) => void;
  onRuntimeIntent: (
    intent: WidgetActionIntent,
    applicationRuntime?: Pick<ApplicationConfig, "action_presets" | "runtime_policy"> & {
      allowedCommandFrameIds?: readonly string[];
      appId: string;
      configId: string;
      onCommandFrameChange?: (frameId: string) => void;
    },
  ) => ReturnType<WidgetActionIntentHandler>;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  onSaveBuilderScreen: (screen: ScreenConfig) => Promise<void>;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  onTeleopContribution: ReturnType<typeof useRuntimeActionDispatcher>["contributeTeleop"];
  onTopicSample: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest: ReturnType<typeof useRuntimeActionDispatcher>["subscribeTopic"];
  onUploadThemeAsset: (file: File) => Promise<string>;
  onSuspendTeleop: ReturnType<typeof useRuntimeActionDispatcher>["suspendTeleop"];
  profilePreferences: Record<string, string>;
  profileOverrides: Record<string, RuntimeProfileOverrides>;
  recentRuntimeSelections: readonly WorkspaceSelection[];
  runtimeCapabilities: readonly RuntimeCapability[] | null;
  runtimeCapabilityReport: RuntimeCapabilityReport | null;
  runtimeActionClient: RuntimeActionClient;
  runtimeActionFeedback: RuntimeActionFeedback | null;
  runtimeMode: RuntimeMode;
  runtimeModeState: RuntimeModeState;
  supervisorRuntimeClient: SupervisorRuntimeClient;
  teleopActive: boolean;
  teleopNeutralRevision: number;
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
  onOpenBuilderHome,
  onOpenHelp,
  onOpenLanding,
  onOpenRuntimeApp,
  onOpenSupervisorApp,
  onOpenSupervisorWindow,
  onRuntimeProfilePreferenceChange,
  onRuntimeProfileOverridesChange,
  onRuntimeIntent,
  onSaveApplication,
  onSaveBuilderScreen,
  onSelectionChange,
  onTeleopContribution,
  onTopicSample,
  onTopicSubscriptionRequest,
  onUploadThemeAsset,
  onSuspendTeleop,
  profilePreferences,
  profileOverrides,
  recentRuntimeSelections,
  runtimeCapabilities,
  runtimeCapabilityReport,
  runtimeActionClient,
  runtimeActionFeedback,
  runtimeMode,
  runtimeModeState,
  supervisorRuntimeClient,
  teleopActive,
  teleopNeutralRevision,
  selection,
  state,
}: ProductWorkspaceProps) {
  if (state.status === "loading") {
    return <ConfigurationStatus message="Loading configurations..." />;
  }

  if (state.status === "error") {
    return <ConfigurationStatus isError message={state.message} />;
  }

  if (state.configurations.length === 0) {
    return <ConfigurationStatus message="No configurations found yet." />;
  }

  if (!selection) {
    return (
      <ConfigurationStatus
        isError={runtimeMode === "supervisor"}
        message={runtimeMode === "supervisor" ? "Supervisor application not found." : "No application selected."}
      />
    );
  }

  const selectedWorkspace = resolveSelectedWorkspace(state.configurations, selection);

  if (activeView === "builder") {
    return (
      <BuilderProductWorkspace
        runtimeCapabilities={runtimeCapabilities}
        runtimeCapabilityReport={runtimeCapabilityReport}
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
        onOpenBuilderHome={onOpenBuilderHome}
        onOpenHelp={onOpenHelp}
        onOpenLanding={onOpenLanding}
        onOpenRuntimeApp={onOpenRuntimeApp}
        onOpenSupervisorApp={onOpenSupervisorApp}
        onProfilePreferenceChange={onRuntimeProfilePreferenceChange}
        profileOverrides={profileOverrides}
        profilePreferences={profilePreferences}
        recentRuntimeSelections={recentRuntimeSelections}
      />
    );
  }

  if (runtimeMode === "supervisor") {
    return (
      <SupervisorWorkspace
        application={selectedWorkspace.application}
        client={supervisorRuntimeClient}
        commandFrameId={
          selectedWorkspace.application.runtime_policy.command_frame_id ||
          runtimeCapabilityReport?.command_frame_id ||
          null
        }
        modeState={runtimeModeState}
        onBackToLibrary={onBackToRuntimeHome}
        preferredProfileId={profilePreferences[runtimePreferenceKey(selection)] ?? ""}
        profileOverrides={profileOverrides}
        robotName={runtimeCapabilityReport?.robot_name ?? null}
        selection={selection}
      />
    );
  }

  return (
    <RuntimeWorkspace
      runtimeCapabilityReport={runtimeCapabilityReport}
      application={selectedWorkspace.application}
      onBackToRuntimeHome={onBackToRuntimeHome}
      onActionIntent={onRuntimeIntent}
      onEditApplication={onEditRuntimeApplication}
      onEditScreen={onEditRuntimeScreen}
      onOpenBuilderHome={onOpenBuilderHome}
      onOpenHelp={onOpenHelp}
      onOpenLanding={onOpenLanding}
      onOpenSupervisor={() => onOpenSupervisorWindow(selection)}
      onProfileChange={(profileId) => {
        onRuntimeProfilePreferenceChange(selection, profileId);
        const layout = resolveInitialScreen(selectedWorkspace.application, profileId);
        if (layout) {
          onSelectionChange({ ...selection, screenId: layout.id });
        }
      }}
      onProfileOverridesChange={(profileId, overrides) =>
        onRuntimeProfileOverridesChange(selection, profileId, overrides)
      }
      onSelectionChange={onSelectionChange}
      onTeleopContribution={onTeleopContribution}
      onTopicSample={onTopicSample}
      onTopicSubscriptionRequest={onTopicSubscriptionRequest}
      onSuspendTeleop={onSuspendTeleop}
      preferredProfileId={profilePreferences[runtimePreferenceKey(selection)] ?? ""}
      profileOverrides={profileOverrides}
      runtimeActionClient={runtimeActionClient}
      runtimeActionFeedback={runtimeActionFeedback}
      runtimeModeState={runtimeModeState}
      screen={selectedWorkspace.screen}
      selection={selection}
      teleopActive={teleopActive}
      teleopNeutralRevision={teleopNeutralRevision}
    />
  );
}

type BuilderProductWorkspaceProps = {
  runtimeCapabilities: readonly RuntimeCapability[] | null;
  runtimeCapabilityReport: RuntimeCapabilityReport | null;
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
  runtimeCapabilities,
  runtimeCapabilityReport,
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
        onOpenRuntimeApp={onOpenRuntimeApp}
        onOpenScreenBuilder={(nextSelection) => {
          onSelectionChange(nextSelection);
          onChangeBuilderMode("screen-builder");
        }}
        onSaveApplication={onSaveApplication}
        onUploadThemeAsset={onUploadThemeAsset}
        runtimeCapabilityReport={runtimeCapabilityReport}
        selection={selection}
      />
    );
  }

  return (
    <BuilderWorkspace
      commandFrameIds={runtimeCapabilityReport?.command_frame_ids}
      robotName={runtimeCapabilityReport?.robot_name}
      runtimeCapabilities={runtimeCapabilities}
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
