import type { ApplicationConfig } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS, type BloomThemePresetId, BloomThemeProvider, resolveBloomThemePreset } from "@bloom/ui";
import { applyCommandStateMessage, clearCommandState, type WidgetActionOutcome } from "@bloom/widget-renderers";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./builder.css";
import "./builder-tour.css";
import "./runtime-app.css";
import "./runtime-settings.css";
import "./runtime-tour.css";
import "./runtime-widgets.css";
import "./supervisor.css";
import "./responsive.css";

import { createApplicationActions } from "./configurations/application-actions";
import {
  type ConfigurationClient,
  createDashboardConfigurationClient,
  createDashboardRuntimeActionClient,
} from "./configurations/configuration-client";
import { useConfigurations } from "./configurations/use-configurations";
import { HelpPage } from "./help/HelpPage";
import { type BuilderMode, ProductWorkspace, type RuntimeMode } from "./product/ProductWorkspace";
import { type RuntimeActionClient, toWidgetActionStatus } from "./runtime/runtime-action-dispatcher";
import { type RuntimeProfileOverrides, runtimeProfileOverrideKey } from "./runtime/runtime-profile-overrides";
import {
  applyRuntimeProfileOverrides,
  resolveRuntimeProfile,
  resolveRuntimeThemePresetId,
} from "./runtime/runtimeProfile";
import { createSupervisorRuntimeClient } from "./runtime/supervisor-client";
import { useRuntimeActionDispatcher } from "./runtime/use-runtime-action-dispatcher";
import { useRuntimeCapabilityReport } from "./runtime/use-runtime-capabilities";
import { AppErrorBoundary } from "./ui/AppErrorBoundary";
import {
  getInitialWorkspaceSelection,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "./ui/ConfigurationWorkspace";
import { applyDocumentTheme } from "./ui/document-theme";
import { LandingPage } from "./ui/LandingPage";
import {
  type BloomRoute,
  builderModeRoute,
  productViewRoute,
  routeToHash,
  runtimeModeRoute,
} from "./ui/navigationRoute";
import { ProductNavigation, type ProductView } from "./ui/ProductNavigation";
import { restoreRuntimeSessionSelection, saveRuntimeSessionSelection } from "./ui/runtime-session-selection";
import {
  addRecentRuntimeSelection,
  loadRuntimeUserPreferences,
  runtimePreferenceKey,
  saveRuntimeUserPreferences,
  setRuntimeProfileOverrides,
  setRuntimeProfilePreference,
} from "./ui/runtime-user-preferences";
import { confirmLeavingUnsaved } from "./ui/unsaved-changes";
import { useBloomRoute } from "./ui/use-bloom-route";

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
  const supervisorRuntimeClient = useMemo(
    () => createSupervisorRuntimeClient(runtimeActionClient),
    [runtimeActionClient],
  );
  const runtimeCapabilityReport = useRuntimeCapabilityReport(runtimeActionClient);
  const runtimeCapabilities = runtimeCapabilityReport?.capabilities ?? null;
  const { navigate, route } = useBloomRoute();
  const { activeView, builderMode, runtimeMode, supervisorTarget, libraryTarget } = route;
  // ADR 0142: every screen renders the backend's command-state store, pushed on the runtime socket.
  useEffect(
    () =>
      runtimeActionClient.addRuntimeCommandStateListener?.((message) =>
        message ? applyCommandStateMessage(message) : clearCommandState(),
      ),
    [runtimeActionClient],
  );
  const [runtimeUserPreferences, setRuntimeUserPreferences] = useState(() => loadRuntimeUserPreferences());
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const activeRouteKey = `${activeView}:${builderMode}:${runtimeMode}:${supervisorTarget?.configId ?? ""}:${supervisorTarget?.appId ?? ""}:${libraryTarget?.appId ?? ""}`;
  // The library is a kiosk screen too (design 5a): its own bar, no product navigation.
  const isRuntimeSessionView = activeView === "runtime";
  const isRuntimeOperationView = activeView === "runtime" && runtimeMode === "app";
  // ADR 0143: a session's palette is this tablet's choice, then the role's, then the app's, resolved here from
  // the same data the workspace reads so the first frame is right. The supervisor mirror shows the operator role's
  // palette (a tablet's choice stays on that tablet). Settings previews a draft palette on top.
  const selectedApplication =
    configurationState.status === "ready" && selection
      ? resolveSelectedWorkspace(configurationState.configurations, selection).application
      : null;
  const windowViewport = useWindowViewport();
  const sessionThemeId = useMemo(() => {
    if (!selectedApplication || !selection || activeView !== "runtime" || runtimeMode === "home") {
      return null;
    }
    const preferredProfileId = runtimeUserPreferences.profilePreferences[runtimePreferenceKey(selection)] ?? "";
    const profile = resolveRuntimeProfile(selectedApplication, windowViewport, preferredProfileId);
    const overrides =
      runtimeMode === "app"
        ? runtimeUserPreferences.profileOverrides[runtimeProfileOverrideKey(selection, profile.id)]
        : undefined;
    return resolveRuntimeThemePresetId(selectedApplication, applyRuntimeProfileOverrides(profile, overrides));
  }, [activeView, runtimeMode, runtimeUserPreferences, selectedApplication, selection, windowViewport]);
  // The library and the landing page keep the last session's palette until another session starts.
  const [lastSessionThemeId, setLastSessionThemeId] = useState<BloomThemePresetId | null>(null);
  useEffect(() => {
    if (sessionThemeId && runtimeMode === "app") {
      setLastSessionThemeId(sessionThemeId);
    }
  }, [runtimeMode, sessionThemeId]);
  const [previewThemeId, setPreviewThemeId] = useState<BloomThemePresetId | null>(null);
  const outsideSession = activeView === "landing" || (activeView === "runtime" && runtimeMode === "home");
  const activeThemeId =
    (isRuntimeOperationView ? previewThemeId : null) ?? sessionThemeId ?? (outsideSession ? lastSessionThemeId : null);
  const activeTheme = activeThemeId
    ? BLOOM_THEME_PRESETS[activeThemeId]
    : selectedApplication
      ? resolveBloomThemePreset(selectedApplication.theme.preset_id)
      : BLOOM_THEME_PRESETS.bloom;
  useEffect(() => {
    applyDocumentTheme(document.documentElement, activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    if (configurationState.status !== "ready") {
      return;
    }

    if (activeView === "runtime" && runtimeMode === "supervisor" && supervisorTarget) {
      const targetSelection = resolveSupervisorSelection(configurationState.configurations, supervisorTarget);
      if (targetSelection && !sameSelection(selection, targetSelection)) {
        setSelection(targetSelection);
      }
      if (!targetSelection && selection) {
        setSelection(null);
      }
      return;
    }

    if (selection) {
      return;
    }
    const restoredSelection =
      activeView === "runtime" && runtimeMode === "app"
        ? restoreRuntimeSessionSelection(configurationState.configurations, runtimeUserPreferences.profilePreferences)
        : null;
    setSelection(restoredSelection ?? getInitialWorkspaceSelection(configurationState.configurations));
  }, [
    activeView,
    configurationState,
    runtimeMode,
    runtimeUserPreferences.profilePreferences,
    selection,
    supervisorTarget,
  ]);

  useEffect(() => {
    if (isRuntimeOperationView && selection) {
      saveRuntimeSessionSelection(selection);
    }
  }, [isRuntimeOperationView, selection]);

  useEffect(() => {
    resetViewportForRoute(activeRouteKey);
  }, [activeRouteKey]);

  useEffect(() => {
    if (!isRuntimeSessionView || !window.matchMedia("(any-pointer: coarse)").matches) {
      return;
    }

    const preventContextMenu = (event: Event) => event.preventDefault();
    document.addEventListener("contextmenu", preventContextMenu);
    return () => document.removeEventListener("contextmenu", preventContextMenu);
  }, [isRuntimeSessionView]);

  useEffect(() => {
    saveRuntimeUserPreferences(runtimeUserPreferences);
  }, [runtimeUserPreferences]);

  useEffect(() => {
    if (!isRuntimeOperationView) {
      runtimeActions.suspendTeleop();
    }
  }, [isRuntimeOperationView, runtimeActions.suspendTeleop]);

  const handleRuntimeIntent = async (
    intent: WidgetActionIntent,
    applicationRuntime?: Pick<ApplicationConfig, "action_presets" | "runtime_policy"> & {
      allowedCommandFrameIds?: readonly string[];
      appId: string;
      configId: string;
      onCommandFrameChange?: (frameId: string) => void;
    },
  ): Promise<WidgetActionOutcome> => {
    if (intent.type === "screen-navigation" && tryNavigateRuntimeScreen(intent.targetScreenId)) {
      return { accepted: true };
    }

    const result = await runtimeActions.dispatch(intent, {
      actionPresets: applicationRuntime?.action_presets,
      allowedCommandFrameIds: applicationRuntime?.allowedCommandFrameIds,
      appId: applicationRuntime?.appId,
      configId: applicationRuntime?.configId,
      onCommandFrameChange: applicationRuntime?.onCommandFrameChange,
      runtimePolicy: applicationRuntime?.runtime_policy,
    });
    const status = toWidgetActionStatus(result);
    // A coalesced or superseded update lost to a newer one, not to a refusal: its control must not snap home.
    return { accepted: status === "accepted" || status === "superseded", detail: result.detail, status };
  };

  const tryNavigateRuntimeScreen = (targetScreenId: string): boolean => {
    if (configurationState.status !== "ready" || !selection) {
      return false;
    }

    const selectedWorkspace = resolveSelectedWorkspace(configurationState.configurations, selection);
    const targetScreen = selectedWorkspace.application.screens.find((screen) => screen.id === targetScreenId);
    if (!targetScreen) {
      return false;
    }

    runtimeActions.suspendTeleop();
    setSelection({ ...selection, screenId: targetScreen.id });
    return true;
  };

  const applicationActions = createApplicationActions({
    configurationClient,
    configurationState,
    navigate: navigateToRoute,
    selection,
    setSelection,
  });

  const handleProductViewChange = (view: ProductView) => {
    navigateToRoute(productViewRoute(view));
  };

  const handleBuilderModeChange = (mode: BuilderMode) => {
    navigateToRoute(builderModeRoute(mode));
  };

  const handleRuntimeModeChange = (mode: RuntimeMode) => {
    navigateToRoute(runtimeModeRoute(mode));
  };

  const [openedFromBuilder, setOpenedFromBuilder] = useState(false);
  const openRuntimeApp = (nextSelection: WorkspaceSelection) => {
    setOpenedFromBuilder(false);
    runtimeActions.clearFeedback();
    setSelection(nextSelection);
    setRuntimeUserPreferences((currentPreferences) => addRecentRuntimeSelection(currentPreferences, nextSelection));
    navigateToRoute(runtimeModeRoute("app"));
  };

  const openSupervisorApp = (nextSelection: WorkspaceSelection) => {
    setSelection(nextSelection);
    navigateToRoute(runtimeModeRoute("supervisor", { appId: nextSelection.appId, configId: nextSelection.configId }));
  };

  const openSupervisorWindow = (nextSelection: WorkspaceSelection) => {
    if (typeof window === "undefined") {
      return;
    }
    const route = runtimeModeRoute("supervisor", {
      appId: nextSelection.appId,
      configId: nextSelection.configId,
    });
    window.open(new URL(routeToHash(route), window.location.href).toString(), "_blank", "noopener,noreferrer");
  };

  const handleRuntimeProfilePreferenceChange = (
    preferenceSelection: Pick<WorkspaceSelection, "appId" | "configId">,
    profileId: string,
  ) => {
    setRuntimeUserPreferences((currentPreferences) =>
      setRuntimeProfilePreference(currentPreferences, preferenceSelection, profileId),
    );
  };

  const handleRuntimeProfileOverridesChange = (
    preferenceSelection: Pick<WorkspaceSelection, "appId" | "configId">,
    profileId: string,
    overrides: RuntimeProfileOverrides,
  ) => {
    setRuntimeUserPreferences((currentPreferences) =>
      setRuntimeProfileOverrides(currentPreferences, preferenceSelection, profileId, overrides),
    );
  };

  const editRuntimeApplication = () => {
    navigateToRoute(builderModeRoute("app-config"));
  };

  const editRuntimeScreen = () => {
    navigateToRoute(builderModeRoute("screen-builder"));
  };

  function navigateToRoute(nextRoute: BloomRoute) {
    if (!confirmLeavingUnsaved()) {
      return;
    }
    if (isRuntimeOperationView && !(nextRoute.activeView === "runtime" && nextRoute.runtimeMode === "app")) {
      runtimeActions.suspendTeleop();
    }
    navigate(nextRoute);
  }

  return (
    <BloomThemeProvider theme={activeTheme}>
      <main
        className={`app-shell app-shell-${activeView}${isRuntimeSessionView ? " app-shell-runtime-app" : ""}`}
        id="bloom-main"
      >
        {isRuntimeSessionView ? null : (
          <ProductNavigation activeView={activeView} onChangeView={handleProductViewChange} />
        )}

        <div id="bloom-main-content" tabIndex={-1}>
          <AppErrorBoundary
            onError={runtimeActions.suspendTeleop}
            onOpenHome={() => handleProductViewChange("landing")}
            resetKey={activeView}
          >
            {activeView === "landing" ? (
              <LandingPage onOpenView={handleProductViewChange} />
            ) : activeView === "help" ? (
              <HelpPage onOpenView={handleProductViewChange} />
            ) : (
              <ProductWorkspace
                runtimeCapabilities={runtimeCapabilities}
                runtimeCapabilityReport={runtimeCapabilityReport}
                activeView={activeView}
                builderMode={builderMode}
                onBackToRuntimeHome={() => handleRuntimeModeChange("home")}
                onChangeBuilderMode={handleBuilderModeChange}
                onCreateApplication={applicationActions.createApplication}
                onDeleteApplication={applicationActions.deleteApplication}
                onDuplicateApplication={applicationActions.duplicateApplication}
                onEditRuntimeApplication={editRuntimeApplication}
                onEditRuntimeScreen={editRuntimeScreen}
                onOpenBuilderHome={() => navigateToRoute(builderModeRoute("home"))}
                onOpenHelp={() => handleProductViewChange("help")}
                onOpenLanding={() => handleProductViewChange("landing")}
                libraryTarget={libraryTarget}
                onOpenRuntimeApp={openRuntimeApp}
                onPreviewRuntimeApp={(nextSelection) => {
                  openRuntimeApp(nextSelection);
                  setOpenedFromBuilder(true);
                }}
                openedFromBuilder={openedFromBuilder}
                onOpenSupervisorApp={openSupervisorApp}
                onOpenSupervisorWindow={openSupervisorWindow}
                onRuntimeProfilePreferenceChange={handleRuntimeProfilePreferenceChange}
                onRuntimeProfileOverridesChange={handleRuntimeProfileOverridesChange}
                onRuntimePreviewTheme={setPreviewThemeId}
                onRuntimeIntent={handleRuntimeIntent}
                onSaveApplication={applicationActions.saveApplication}
                onSaveBuilderScreen={applicationActions.saveScreen}
                onSelectionChange={setSelection}
                onTeleopContribution={runtimeActions.contributeTeleop}
                onTeleopCommand={runtimeActions.addTeleopCommandListener}
                onTopicSample={runtimeActionClient.addRuntimeTopicSampleListener}
                onTopicSubscriptionRequest={runtimeActions.subscribeTopic}
                onUploadThemeAsset={applicationActions.uploadThemeAsset}
                onSuspendTeleop={runtimeActions.suspendTeleop}
                profilePreferences={runtimeUserPreferences.profilePreferences}
                profileOverrides={runtimeUserPreferences.profileOverrides}
                recentRuntimeSelections={runtimeUserPreferences.recentRuntimeSelections}
                runtimeActionClient={runtimeActionClient}
                runtimeActionFeedback={runtimeActions.feedback}
                runtimeMode={runtimeMode}
                supervisorRuntimeClient={supervisorRuntimeClient}
                teleopActive={runtimeActions.teleopActive}
                teleopNeutralRevision={runtimeActions.neutralRevision}
                selection={selection}
                state={configurationState}
              />
            )}
          </AppErrorBoundary>
        </div>
      </main>
    </BloomThemeProvider>
  );
}

const readWindowViewport = () => ({ height: window.innerHeight, width: window.innerWidth });

/** The window, for the profile heuristic a session without a remembered role uses. */
function useWindowViewport() {
  const [viewport, setViewport] = useState(readWindowViewport);
  useEffect(() => {
    const onResize = () => setViewport(readWindowViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

function resetViewportForRoute(_routeKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.scrollTo({ top: 0 });
  const mainContent = document.getElementById("bloom-main-content");
  if (!mainContent) {
    return;
  }
  // This wrapper has no accessible name, so a view that already moved focus to
  // its own labelled region keeps it.
  if (mainContent.contains(document.activeElement) && document.activeElement !== mainContent) {
    return;
  }
  mainContent.focus({ preventScroll: true });
}

function resolveSupervisorSelection(
  configurations: Extract<ReturnType<typeof useConfigurations>, { status: "ready" }>["configurations"],
  target: NonNullable<BloomRoute["supervisorTarget"]>,
): WorkspaceSelection | null {
  const configuration = configurations.find((candidate) => candidate.id === target.configId);
  const application = configuration?.bundle.applications.find((candidate) => candidate.id === target.appId);
  const screen = application?.screens[0];
  return configuration && application && screen
    ? { appId: application.id, configId: configuration.id, screenId: screen.id }
    : null;
}

function sameSelection(current: WorkspaceSelection | null, next: WorkspaceSelection): boolean {
  return current?.appId === next.appId && current.configId === next.configId && current.screenId === next.screenId;
}
