import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { BLOOM_THEME_PRESETS, BloomButton, BloomCard, BloomTag, BloomThemeProvider } from "@bloom/ui";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useState } from "react";
import "./App.css";
import "./builder.css";
import "./runtime-app.css";
import "./runtime-widgets.css";
import "./responsive.css";

import { BuilderAppConfig } from "./builder/BuilderAppConfig";
import { BuilderHome } from "./builder/BuilderHome";
import { BuilderWorkspace } from "./builder/BuilderWorkspace";
import {
  type ConfigurationClient,
  createDashboardConfigurationClient,
  createDashboardRuntimeActionClient,
} from "./configurations/configuration-client";
import { duplicateApplicationInConfigurationBundle } from "./configurations/configuration-editor";
import type { LoadedConfiguration } from "./configurations/configuration-loader";
import { useConfigurations } from "./configurations/use-configurations";
import { HelpPage } from "./help/HelpPage";
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
import {
  type BloomRoute,
  builderModeRoute,
  parseBloomRoute,
  productViewRoute,
  routeToHash,
  runtimeModeRoute,
} from "./ui/navigationRoute";
import { ProductNavigation, type ProductView } from "./ui/ProductNavigation";

const defaultConfigurationClient = createDashboardConfigurationClient();
const defaultRuntimeActionClient = createDashboardRuntimeActionClient();

type BuilderMode = "app-config" | "home" | "screen-builder";
type RuntimeMode = "app" | "home";

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
  const initialRoute = getInitialBloomRoute();
  const [activeView, setActiveView] = useState<ProductView>(initialRoute.activeView);
  const [builderMode, setBuilderMode] = useState<BuilderMode>(initialRoute.builderMode);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(initialRoute.runtimeMode);
  const [recentRuntimeSelections, setRecentRuntimeSelections] = useState<readonly WorkspaceSelection[]>([]);
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);

  useEffect(() => {
    const syncRouteFromBrowserHistory = () => {
      const route = parseBloomRoute(window.location.hash);
      setActiveView(route.activeView);
      setBuilderMode(route.builderMode);
      setRuntimeMode(route.runtimeMode);
    };

    window.addEventListener("hashchange", syncRouteFromBrowserHistory);
    window.addEventListener("popstate", syncRouteFromBrowserHistory);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromBrowserHistory);
      window.removeEventListener("popstate", syncRouteFromBrowserHistory);
    };
  }, []);

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
    setRecentRuntimeSelections((currentSelections) =>
      [
        nextSelection,
        ...currentSelections.filter(
          (candidate) => candidate.configId !== nextSelection.configId || candidate.appId !== nextSelection.appId,
        ),
      ].slice(0, 3),
    );
    navigateToRoute(runtimeModeRoute("app"));
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
  }

  function navigateToRoute(route: BloomRoute) {
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
    <BloomThemeProvider theme={BLOOM_THEME_PRESETS.bloom}>
      <main className={`app-shell app-shell-${activeView}`} id="bloom-main">
        <ProductNavigation activeView={activeView} onChangeView={handleProductViewChange} />

        <div id="bloom-main-content" tabIndex={-1}>
          <AppErrorBoundary resetKey={activeView}>
            {activeView === "landing" ? (
              <LandingPage onOpenView={handleProductViewChange} />
            ) : activeView === "help" ? (
              <HelpPage onOpenView={handleProductViewChange} />
            ) : (
              <MainApplicationView
                activeView={activeView}
                builderMode={builderMode}
                onBackToRuntimeHome={() => handleRuntimeModeChange("home")}
                onChangeBuilderMode={handleBuilderModeChange}
                onCreateApplication={handleCreateApplication}
                onDeleteApplication={handleDeleteApplication}
                onDuplicateApplication={handleDuplicateApplication}
                onEditRuntimeApplication={editRuntimeApplication}
                onEditRuntimeScreen={editRuntimeScreen}
                onOpenRuntimeApp={openRuntimeApp}
                onRuntimeIntent={handleRuntimeIntent}
                onSaveApplication={handleSaveApplication}
                onSaveBuilderScreen={handleSaveBuilderScreen}
                onSelectionChange={setSelection}
                onTopicSample={runtimeActionClient.addRuntimeTopicSampleListener}
                onTopicSubscriptionRequest={runtimeActions.subscribeTopic}
                onUploadThemeAsset={handleUploadThemeAsset}
                recentRuntimeSelections={recentRuntimeSelections}
                runtimeMode={runtimeMode}
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

function getInitialBloomRoute(): BloomRoute {
  if (typeof window === "undefined") {
    return parseBloomRoute("");
  }

  return parseBloomRoute(window.location.hash);
}

type MainApplicationViewProps = {
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

function MainApplicationView({
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

type RuntimeHomeProps = {
  configurations: readonly LoadedConfiguration[];
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  recentRuntimeSelections: readonly WorkspaceSelection[];
};

function RuntimeHome({ configurations, onOpenRuntimeApp, recentRuntimeSelections }: RuntimeHomeProps) {
  const runtimeApps = configurations.flatMap((configuration) =>
    configuration.bundle.applications.map((application) => ({
      application,
      configuration,
      firstScreen: application.screens[0],
    })),
  );
  const recentRuntimeApps = recentRuntimeSelections
    .map((recentSelection) => {
      const configuration = configurations.find((candidate) => candidate.id === recentSelection.configId);
      const application = configuration?.bundle.applications.find(
        (candidate) => candidate.id === recentSelection.appId,
      );
      const screen =
        application?.screens.find((candidate) => candidate.id === recentSelection.screenId) ?? application?.screens[0];

      return configuration && application && screen ? { application, configuration, screen } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  return (
    <section className="runtime-home" aria-labelledby="runtime-home-title">
      <div className="runtime-home-hero">
        <div>
          <p className="eyebrow">Runtime library</p>
          <h1 id="runtime-home-title">Choose an app to operate.</h1>
        </div>
        <p>
          Runtime is the clean operator view. Pick an app here, then use the small edit shortcuts only when something
          needs to go back through the builder.
        </p>
      </div>

      {recentRuntimeApps.length > 0 ? (
        <section className="runtime-recent-panel" aria-labelledby="runtime-recent-title">
          <div>
            <p className="eyebrow">Recently opened</p>
            <h2 id="runtime-recent-title">Resume quickly</h2>
          </div>
          <div className="runtime-recent-actions">
            {recentRuntimeApps.map(({ application, configuration, screen }) => (
              <button
                aria-label={`Resume ${application.name} on ${screen.title}`}
                className="runtime-recent-action"
                key={`${configuration.id}:${application.id}`}
                onClick={() =>
                  onOpenRuntimeApp({ appId: application.id, configId: configuration.id, screenId: screen.id })
                }
                type="button"
              >
                <strong>{application.name}</strong>
                <span>{screen.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ul className="runtime-app-grid" aria-label="Available runtime apps">
        {runtimeApps.map(({ application, configuration, firstScreen }) => (
          <li key={`${configuration.id}:${application.id}`}>
            <BloomCard className="runtime-app-card" tone="default">
              <div>
                <BloomTag tone="primary">{application.screens.length} screens</BloomTag>
                <h2>{application.name}</h2>
                {application.description ? <p>{application.description}</p> : <p>Ready to launch in operator mode.</p>}
              </div>
              <BloomButton
                ariaLabel={`Launch ${application.name} runtime`}
                className="runtime-app-card-action"
                disabled={!firstScreen}
                onClick={() => {
                  if (!firstScreen) {
                    return;
                  }
                  onOpenRuntimeApp({ appId: application.id, configId: configuration.id, screenId: firstScreen.id });
                }}
                tone="primary"
              >
                Launch runtime
              </BloomButton>
            </BloomCard>
          </li>
        ))}
      </ul>
    </section>
  );
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
