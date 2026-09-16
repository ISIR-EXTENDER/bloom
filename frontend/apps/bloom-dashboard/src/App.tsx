import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS, BloomThemeProvider } from "@bloom/ui";
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

import {
  type ConfigurationClient,
  createDashboardConfigurationClient,
  createDashboardRuntimeActionClient,
} from "./configurations/configuration-client";
import { duplicateApplicationInConfigurationBundle } from "./configurations/configuration-editor";
import { useConfigurations } from "./configurations/use-configurations";
import { HelpPage } from "./help/HelpPage";
import { type BuilderMode, ProductWorkspace, type RuntimeMode } from "./product/ProductWorkspace";
import type { RuntimeActionClient } from "./runtime/runtime-action-dispatcher";
import type { RuntimeProfileOverrides } from "./runtime/runtime-profile-overrides";
import { applyRuntimeModeIntent, createDefaultRuntimeModeState } from "./runtime/runtimeModeState";
import { createSupervisorRuntimeClient } from "./runtime/supervisor-client";
import { useRuntimeActionDispatcher } from "./runtime/use-runtime-action-dispatcher";
import { useRuntimeCapabilityReport } from "./runtime/use-runtime-capabilities";
import { AppErrorBoundary } from "./ui/AppErrorBoundary";
import {
  getInitialWorkspaceSelection,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "./ui/ConfigurationWorkspace";
import { LandingPage } from "./ui/LandingPage";
import {
  type BloomRoute,
  builderModeRoute,
  parseBloomRoute,
  productViewRoute,
  routeToHash,
  runtimeModeRoute,
} from "./ui/navigationRoute";
import { ProductNavigation, type ProductView } from "./ui/ProductNavigation";
import {
  addRecentRuntimeSelection,
  loadRuntimeUserPreferences,
  saveRuntimeUserPreferences,
  setRuntimeProfileOverrides,
  setRuntimeProfilePreference,
} from "./ui/runtime-user-preferences";

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
  const initialRoute = getInitialBloomRoute();
  const [activeView, setActiveView] = useState<ProductView>(initialRoute.activeView);
  const [builderMode, setBuilderMode] = useState<BuilderMode>(initialRoute.builderMode);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(initialRoute.runtimeMode);
  const [supervisorTarget, setSupervisorTarget] = useState(initialRoute.supervisorTarget);
  const [runtimeModeState, setRuntimeModeState] = useState(() => createDefaultRuntimeModeState());
  const [runtimeUserPreferences, setRuntimeUserPreferences] = useState(() => loadRuntimeUserPreferences());
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const activeRouteKey = `${activeView}:${builderMode}:${runtimeMode}:${supervisorTarget?.configId ?? ""}:${supervisorTarget?.appId ?? ""}`;
  const isRuntimeSessionView = activeView === "runtime" && runtimeMode !== "home";
  const isRuntimeOperationView = activeView === "runtime" && runtimeMode === "app";
  const activeTheme =
    configurationState.status === "ready" && selection
      ? resolveThemePreset(
          resolveSelectedWorkspace(configurationState.configurations, selection).application.theme.preset_id,
        )
      : BLOOM_THEME_PRESETS.bloom;

  useEffect(() => {
    const syncRouteFromBrowserHistory = () => {
      const route = parseBloomRoute(window.location.hash);
      setActiveView(route.activeView);
      setBuilderMode(route.builderMode);
      setRuntimeMode(route.runtimeMode);
      setSupervisorTarget(route.supervisorTarget);
    };

    window.addEventListener("hashchange", syncRouteFromBrowserHistory);
    window.addEventListener("popstate", syncRouteFromBrowserHistory);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromBrowserHistory);
      window.removeEventListener("popstate", syncRouteFromBrowserHistory);
    };
  }, []);

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
    setSelection(getInitialWorkspaceSelection(configurationState.configurations));
  }, [activeView, configurationState, runtimeMode, selection, supervisorTarget]);

  useEffect(() => {
    resetViewportForRoute(activeRouteKey);
  }, [activeRouteKey]);

  useEffect(() => {
    saveRuntimeUserPreferences(runtimeUserPreferences);
  }, [runtimeUserPreferences]);

  useEffect(() => {
    if (!isRuntimeOperationView) {
      runtimeActions.suspendTeleop();
    }
  }, [isRuntimeOperationView, runtimeActions.suspendTeleop]);

  const handleRuntimeIntent = (
    intent: WidgetActionIntent,
    applicationRuntime?: Pick<ApplicationConfig, "action_presets" | "runtime_policy"> & {
      allowedCommandFrameIds?: readonly string[];
      appId: string;
      configId: string;
      onCommandFrameChange?: (frameId: string) => void;
    },
  ) => {
    if (intent.type === "screen-navigation" && tryNavigateRuntimeScreen(intent.targetScreenId)) {
      return;
    }

    setRuntimeModeState((currentModeState) => applyRuntimeModeIntent(currentModeState, intent));
    runtimeActions.dispatch(intent, {
      actionPresets: applicationRuntime?.action_presets,
      allowedCommandFrameIds: applicationRuntime?.allowedCommandFrameIds,
      appId: applicationRuntime?.appId,
      configId: applicationRuntime?.configId,
      onCommandFrameChange: applicationRuntime?.onCommandFrameChange,
      runtimePolicy: applicationRuntime?.runtime_policy,
    });
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

  const handleUploadThemeAsset = async (file: File): Promise<string> => {
    if (configurationState.status !== "ready" || !selection) {
      throw new Error("Bloom cannot upload a theme asset before an application is selected.");
    }

    const selectedWorkspace = resolveSelectedWorkspace(configurationState.configurations, selection);
    const contentBase64 = await readFileAsBase64(file);
    const response = await configurationClient.uploadThemeAsset(selectedWorkspace.configuration.id, {
      filename: file.name,
      content_type: file.type,
      content_base64: contentBase64,
    });
    return response.uri;
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
    navigateToRoute(builderModeRoute("app-config"));
  };

  const handleProductViewChange = (view: ProductView) => {
    navigateToRoute(productViewRoute(view));
  };

  const handleBuilderModeChange = (mode: BuilderMode) => {
    navigateToRoute(builderModeRoute(mode));
  };

  const handleRuntimeModeChange = (mode: RuntimeMode) => {
    navigateToRoute(runtimeModeRoute(mode));
  };

  const openRuntimeApp = (nextSelection: WorkspaceSelection) => {
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
    navigateToRoute(builderModeRoute("app-config"));
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
      navigateToRoute(builderModeRoute("home"));
      return;
    }

    setSelection({ configId, appId: nextApplication.id, screenId: nextScreen.id });
    navigateToRoute(builderModeRoute("home"));
  };

  function applyRoute(route: BloomRoute) {
    setActiveView(route.activeView);
    setBuilderMode(route.builderMode);
    setRuntimeMode(route.runtimeMode);
    setSupervisorTarget(route.supervisorTarget);
  }

  function navigateToRoute(route: BloomRoute) {
    if (isRuntimeOperationView && !(route.activeView === "runtime" && route.runtimeMode === "app")) {
      runtimeActions.suspendTeleop();
    }
    applyRoute(route);

    if (typeof window === "undefined") {
      return;
    }

    const nextHash = routeToHash(route);
    if (window.location.hash === nextHash) {
      return;
    }

    window.history.pushState(null, "", nextHash);
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
          <AppErrorBoundary resetKey={activeView}>
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
                onCreateApplication={handleCreateApplication}
                onDeleteApplication={handleDeleteApplication}
                onDuplicateApplication={handleDuplicateApplication}
                onEditRuntimeApplication={editRuntimeApplication}
                onEditRuntimeScreen={editRuntimeScreen}
                onOpenBuilderHome={() => navigateToRoute(builderModeRoute("home"))}
                onOpenHelp={() => handleProductViewChange("help")}
                onOpenLanding={() => handleProductViewChange("landing")}
                onOpenRuntimeApp={openRuntimeApp}
                onOpenSupervisorApp={openSupervisorApp}
                onOpenSupervisorWindow={openSupervisorWindow}
                onRuntimeProfilePreferenceChange={handleRuntimeProfilePreferenceChange}
                onRuntimeProfileOverridesChange={handleRuntimeProfileOverridesChange}
                onRuntimeIntent={handleRuntimeIntent}
                onSaveApplication={handleSaveApplication}
                onSaveBuilderScreen={handleSaveBuilderScreen}
                onSelectionChange={setSelection}
                onTeleopContribution={runtimeActions.contributeTeleop}
                onTopicSample={runtimeActionClient.addRuntimeTopicSampleListener}
                onTopicSubscriptionRequest={runtimeActions.subscribeTopic}
                onUploadThemeAsset={handleUploadThemeAsset}
                onSuspendTeleop={runtimeActions.suspendTeleop}
                profilePreferences={runtimeUserPreferences.profilePreferences}
                profileOverrides={runtimeUserPreferences.profileOverrides}
                recentRuntimeSelections={runtimeUserPreferences.recentRuntimeSelections}
                runtimeActionClient={runtimeActionClient}
                runtimeMode={runtimeMode}
                runtimeModeState={runtimeModeState}
                supervisorRuntimeClient={supervisorRuntimeClient}
                teleopActive={runtimeActions.teleopActive}
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

function resolveThemePreset(presetId: string) {
  if (presetId === "bloom-default" || presetId === "bloom") {
    return BLOOM_THEME_PRESETS.bloom;
  }

  return BLOOM_THEME_PRESETS[presetId as keyof typeof BLOOM_THEME_PRESETS] ?? BLOOM_THEME_PRESETS.bloom;
}

function getInitialBloomRoute(): BloomRoute {
  if (typeof window === "undefined") {
    return parseBloomRoute("");
  }

  return parseBloomRoute(window.location.hash);
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

function resetViewportForRoute(_routeKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.scrollTo({ top: 0 });
  document.getElementById("bloom-main-content")?.focus({ preventScroll: true });
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
