import {
  type ApplicationConfig,
  DEFAULT_ACTION_PRESETS,
  DEFAULT_APPLICATION_THEME,
  DEFAULT_RUNTIME_POLICY,
  type ScreenConfig,
} from "@bloom/api-client";
import { useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import {
  type BuilderHomeSection,
  createBuilderApplicationItems,
  createNewApplicationName,
  createPreviewWidgetStyle,
  createScreenLibraryItems,
  filterScreens,
  groupScreensByType,
  SCREEN_LIBRARY_TYPE_LABELS,
  type ScreenLibraryType,
  selectPlaygroundScreens,
  slugify,
} from "./builderHomeModel";

type BuilderHomeProps = {
  configurations: readonly LoadedConfiguration[];
  onCreateApplication: (configId: string, application: ApplicationConfig) => Promise<void>;
  onDeleteApplication: (configId: string, applicationId: string) => Promise<void>;
  onDuplicateApplication: (configId: string, applicationId: string) => Promise<void>;
  onOpenApplication: (selection: WorkspaceSelection) => void;
  onOpenScreenBuilder: (selection: WorkspaceSelection) => void;
  onPreviewScreenRuntime: (selection: WorkspaceSelection) => void;
};

type CreateState = { status: "idle" } | { status: "creating" } | { status: "error"; message: string };
type CreateWizardState = {
  includeOnboardingSpots: boolean;
  name: string;
  starterId: StarterScreenId;
  themePresetId: CreateThemePresetId;
};
type AppActionState =
  | { status: "idle" }
  | { applicationId: string; status: "deleting" | "duplicating" }
  | { message: string; status: "error" };
type PlaygroundActionState =
  | { status: "idle" }
  | { screenId: string; status: "promoting" }
  | { message: string; status: "error" };

type StarterScreenId = "blank" | "operator-control" | "debug-monitor";
type CreateThemePresetId = "bloom-default" | "extender-ui" | "high-visibility";

const CREATE_THEME_PRESETS: Record<CreateThemePresetId, ApplicationConfig["theme"]> = {
  "bloom-default": {
    ...DEFAULT_APPLICATION_THEME,
    preset_id: "bloom-default",
    palette: {
      accent: "#d9a441",
      background: "#f7f1e6",
      primary: "#7f967e",
      surface: "#fffdf7",
    },
  },
  "extender-ui": DEFAULT_APPLICATION_THEME,
  "high-visibility": {
    ...DEFAULT_APPLICATION_THEME,
    preset_id: "extender-ui",
    palette: {
      accent: "#f59e0b",
      background: "#f8fafc",
      primary: "#1d4ed8",
      surface: "#ffffff",
    },
  },
};

const STARTER_SCREEN_LABELS: Record<StarterScreenId, string> = {
  blank: "Blank canvas",
  "operator-control": "Operator controls",
  "debug-monitor": "Debug monitor",
};

export function BuilderHome({
  configurations,
  onCreateApplication,
  onDeleteApplication,
  onDuplicateApplication,
  onOpenApplication,
  onOpenScreenBuilder,
  onPreviewScreenRuntime,
}: BuilderHomeProps) {
  const firstConfiguration = configurations[0];
  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [appActionState, setAppActionState] = useState<AppActionState>({ status: "idle" });
  const [activeSection, setActiveSection] = useState<BuilderHomeSection>("overview");
  const [pendingDeleteApplicationId, setPendingDeleteApplicationId] = useState<string | null>(null);
  const [playgroundActionState, setPlaygroundActionState] = useState<PlaygroundActionState>({ status: "idle" });
  const [screenSearch, setScreenSearch] = useState("");
  const isCreating = createState.status === "creating";
  const applications = createBuilderApplicationItems(configurations);
  const screens = createScreenLibraryItems(applications);
  const filteredScreens = filterScreens(screens, screenSearch);
  const screenGroups = groupScreensByType(filteredScreens);
  const [createWizard, setCreateWizard] = useState<CreateWizardState>(() =>
    createDefaultWizardState(firstConfiguration?.bundle.applications ?? []),
  );

  return (
    <section className="builder-home" aria-labelledby="builder-home-title">
      <header className="builder-home-hero">
        <div>
          <p className="eyebrow">Builder</p>
          <h1 id="builder-home-title">Choose what to build.</h1>
          <p>
            Start from apps when you want to shape a full workflow, or jump into the shared screen library when you only
            need to design one reusable view.
          </p>
        </div>
      </header>

      <nav className="builder-home-switcher" aria-label="Builder sections">
        <button
          aria-current={activeSection === "overview" ? "page" : undefined}
          onClick={() => setActiveSection("overview")}
          type="button"
        >
          Overview
        </button>
        <button
          aria-current={activeSection === "apps" ? "page" : undefined}
          onClick={() => setActiveSection("apps")}
          type="button"
        >
          Apps
        </button>
        <button
          aria-current={activeSection === "screens" ? "page" : undefined}
          onClick={() => setActiveSection("screens")}
          type="button"
        >
          Screen library
        </button>
        <button
          aria-current={activeSection === "playground" ? "page" : undefined}
          onClick={() => setActiveSection("playground")}
          type="button"
        >
          Playground
        </button>
      </nav>

      {activeSection === "overview" ? (
        <section className="builder-section-overview" aria-label="Builder overview">
          <button className="builder-overview-card" onClick={() => setActiveSection("apps")} type="button">
            <span className="builder-overview-card-kicker">Apps</span>
            <strong>Manage complete app workflows</strong>
            <span>{applications.length} apps ready for configuration, runtime launch, duplication, or deletion.</span>
          </button>
          <button className="builder-overview-card" onClick={() => setActiveSection("screens")} type="button">
            <span className="builder-overview-card-kicker">Screens</span>
            <strong>Design reusable screens first</strong>
            <span>{screens.length} screens available across the shared library and existing apps.</span>
          </button>
          <button className="builder-overview-card" onClick={() => setActiveSection("playground")} type="button">
            <span className="builder-overview-card-kicker">Playground</span>
            <strong>Try runtime screens without setup</strong>
            <span>Open camera, debug, or teleop smoke screens quickly before promoting ideas into apps.</span>
          </button>
        </section>
      ) : null}

      {activeSection === "apps" ? (
        <div className="builder-home-grid">
          <section className="builder-app-list" aria-labelledby="builder-app-list-title">
            <div>
              <p className="eyebrow">Saved apps</p>
              <h2 id="builder-app-list-title">Available apps</h2>
            </div>
            <div className="builder-app-cards">
              {applications.length === 0 ? (
                <p className="builder-empty-state">No apps found yet. Create the first app foundation to start.</p>
              ) : (
                applications.map(({ application, configuration }) => {
                  const firstScreen = application.screens[0];
                  const actionState =
                    appActionState.status === "deleting" || appActionState.status === "duplicating"
                      ? appActionState
                      : null;
                  const isActingOnThisApp = actionState?.applicationId === application.id;
                  const isConfirmingDelete = pendingDeleteApplicationId === application.id;

                  return (
                    <article className="builder-app-card" key={`${configuration.id}:${application.id}`}>
                      <span
                        className="builder-app-card-theme"
                        style={{ background: application.theme.palette.primary }}
                      />
                      <strong>{application.name}</strong>
                      <span>{application.description || "No description yet."}</span>
                      <small>
                        {application.screens.length} screens · {configuration.id}
                      </small>
                      <div className="builder-app-card-actions">
                        <button
                          aria-label={`Open ${application.name} app`}
                          disabled={!firstScreen || isActingOnThisApp}
                          onClick={() => {
                            if (!firstScreen) {
                              return;
                            }
                            onOpenApplication({
                              appId: application.id,
                              configId: configuration.id,
                              screenId: firstScreen.id,
                            });
                          }}
                          type="button"
                        >
                          Open app
                        </button>
                        <button
                          aria-label={`Open ${application.name} runtime`}
                          disabled={!firstScreen || isActingOnThisApp}
                          onClick={() => {
                            if (!firstScreen) {
                              return;
                            }
                            onPreviewScreenRuntime({
                              appId: application.id,
                              configId: configuration.id,
                              screenId: firstScreen.id,
                            });
                          }}
                          type="button"
                        >
                          Open runtime
                        </button>
                        <button
                          aria-label={`Duplicate ${application.name} app`}
                          disabled={isActingOnThisApp}
                          onClick={async () => {
                            setAppActionState({ applicationId: application.id, status: "duplicating" });
                            try {
                              await onDuplicateApplication(configuration.id, application.id);
                              setAppActionState({ status: "idle" });
                            } catch (error) {
                              setAppActionState({ status: "error", message: getErrorMessage(error) });
                            }
                          }}
                          type="button"
                        >
                          {isActingOnThisApp && actionState?.status === "duplicating" ? "Duplicating..." : "Duplicate"}
                        </button>
                        <button
                          aria-label={`Delete ${application.name} app`}
                          className="builder-app-card-danger"
                          disabled={isActingOnThisApp}
                          onClick={() => setPendingDeleteApplicationId(application.id)}
                          type="button"
                        >
                          {isActingOnThisApp && actionState?.status === "deleting" ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                      {isConfirmingDelete ? (
                        <fieldset className="builder-app-delete-confirmation">
                          <legend>Confirm delete {application.name}</legend>
                          <p>
                            Delete <strong>{application.name}</strong>? This removes the app from this configuration.
                          </p>
                          <div>
                            <button onClick={() => setPendingDeleteApplicationId(null)} type="button">
                              Cancel
                            </button>
                            <button
                              className="builder-app-delete-confirmation-danger"
                              disabled={isActingOnThisApp}
                              onClick={async () => {
                                setAppActionState({ applicationId: application.id, status: "deleting" });
                                try {
                                  await onDeleteApplication(configuration.id, application.id);
                                  setPendingDeleteApplicationId(null);
                                  setAppActionState({ status: "idle" });
                                } catch (error) {
                                  setAppActionState({ status: "error", message: getErrorMessage(error) });
                                }
                              }}
                              type="button"
                            >
                              Delete permanently
                            </button>
                          </div>
                        </fieldset>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
            {appActionState.status === "error" ? (
              <p className="builder-save-status builder-save-status-error" role="alert">
                {appActionState.message}
              </p>
            ) : null}
          </section>

          <section className="builder-create-card" aria-labelledby="builder-create-title">
            <div>
              <p className="eyebrow">Create</p>
              <h2 id="builder-create-title">Create guided app</h2>
            </div>
            <label>
              <span>App name</span>
              <input
                aria-label="New app name"
                onChange={(event) => setCreateWizard({ ...createWizard, name: event.target.value })}
                value={createWizard.name}
              />
            </label>
            <label>
              <span>Starter screen</span>
              <select
                aria-label="Starter screen"
                onChange={(event) =>
                  setCreateWizard({ ...createWizard, starterId: event.target.value as StarterScreenId })
                }
                value={createWizard.starterId}
              >
                <option value="blank">{STARTER_SCREEN_LABELS.blank}</option>
                <option value="operator-control">{STARTER_SCREEN_LABELS["operator-control"]}</option>
                <option value="debug-monitor">{STARTER_SCREEN_LABELS["debug-monitor"]}</option>
              </select>
            </label>
            <label>
              <span>Design preset</span>
              <select
                aria-label="Design preset"
                onChange={(event) =>
                  setCreateWizard({ ...createWizard, themePresetId: event.target.value as CreateThemePresetId })
                }
                value={createWizard.themePresetId}
              >
                <option value="extender-ui">Extender light</option>
                <option value="bloom-default">Bloom garden</option>
                <option value="high-visibility">High visibility</option>
              </select>
            </label>
            <label className="builder-create-checkbox">
              <input
                checked={createWizard.includeOnboardingSpots}
                onChange={(event) => setCreateWizard({ ...createWizard, includeOnboardingSpots: event.target.checked })}
                type="checkbox"
              />
              <span>Include onboarding spots</span>
            </label>
            <button
              disabled={!firstConfiguration || isCreating}
              onClick={async () => {
                if (!firstConfiguration) {
                  return;
                }
                const application = createGuidedApplication(createWizard, firstConfiguration.bundle.applications);
                setCreateState({ status: "creating" });
                try {
                  await onCreateApplication(firstConfiguration.id, application);
                  setCreateState({ status: "idle" });
                } catch (error) {
                  setCreateState({ status: "error", message: getErrorMessage(error) });
                }
              }}
              type="button"
            >
              {isCreating ? "Creating..." : "Create guided app"}
            </button>
            {createState.status === "error" ? (
              <p className="builder-save-status builder-save-status-error" role="alert">
                {createState.message}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeSection === "screens" ? (
        <section className="builder-screen-library" aria-labelledby="builder-screen-library-title">
          <div className="builder-screen-library-heading">
            <div>
              <p className="eyebrow">Screen library</p>
              <h2 id="builder-screen-library-title">Reusable screens</h2>
            </div>
            <span>{filteredScreens.length} screens</span>
          </div>
          <p>
            Work directly from reusable screens when you want to design a control, camera, or debug view before
            assigning it to a specific app flow.
          </p>
          <label className="builder-screen-library-search">
            <span>Find a screen</span>
            <input
              aria-label="Find a screen"
              onChange={(event) => setScreenSearch(event.target.value)}
              placeholder="Camera, teleop, debug..."
              type="search"
              value={screenSearch}
            />
          </label>
          <div className="builder-screen-library-groups">
            {filteredScreens.length === 0 ? (
              <p className="builder-empty-state">
                No screens match this search yet. Try another app name, screen name, or widget type.
              </p>
            ) : (
              screenGroups.map((group) => (
                <section
                  aria-labelledby={`builder-screen-library-${group.definition.type}`}
                  className="builder-screen-library-group"
                  key={group.definition.type}
                >
                  <div className="builder-screen-library-group-heading">
                    <div>
                      <h3 id={`builder-screen-library-${group.definition.type}`}>{group.definition.label}</h3>
                      <p>{group.definition.description}</p>
                    </div>
                    <span>{group.items.length}</span>
                  </div>
                  <div className="builder-screen-library-grid">
                    {group.items.map(({ application, configuration, displayTitle, screen, type }) => (
                      <article
                        className="builder-screen-library-card"
                        data-screen-type={type}
                        key={`${configuration.id}:${application.id}:${screen.id}`}
                      >
                        <div className="builder-screen-card-main">
                          <div className="builder-screen-card-title-row">
                            <strong>{displayTitle}</strong>
                            <span className="builder-screen-type-tag">{SCREEN_LIBRARY_TYPE_LABELS[type]}</span>
                          </div>
                          <ScreenLibraryPreview screen={screen} type={type} />
                          <span>{application.name}</span>
                          <div className="builder-screen-card-details">
                            <span>{screen.widgets.length} widgets</span>
                            <span>{screen.canvas.preset_id}</span>
                            <span>{configuration.id}</span>
                          </div>
                        </div>
                        <div className="builder-app-card-actions">
                          <button
                            aria-label={`Edit ${displayTitle} screen`}
                            onClick={() =>
                              onOpenScreenBuilder({
                                appId: application.id,
                                configId: configuration.id,
                                screenId: screen.id,
                              })
                            }
                            type="button"
                          >
                            Edit screen
                          </button>
                          <button
                            aria-label={`Preview ${displayTitle} screen runtime`}
                            onClick={() =>
                              onPreviewScreenRuntime({
                                appId: application.id,
                                configId: configuration.id,
                                screenId: screen.id,
                              })
                            }
                            type="button"
                          >
                            Runtime preview
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "playground" ? (
        <section className="builder-playground" aria-labelledby="builder-playground-title">
          <div>
            <p className="eyebrow">Draft lab</p>
            <h2 id="builder-playground-title">Try screens before creating an app</h2>
            <p>
              Use the playground for quick robot experiments, hardware checks, and widget demos. Nothing here forces a
              saved workflow yet, but every screen can later become reusable.
            </p>
          </div>
          <div className="builder-playground-grid">
            {selectPlaygroundScreens(screens).map(({ application, configuration, displayTitle, screen, type }) => (
              <article
                className="builder-playground-card"
                data-screen-type={type}
                key={`${configuration.id}:${application.id}:${screen.id}`}
              >
                <span className="builder-screen-type-tag">{SCREEN_LIBRARY_TYPE_LABELS[type]}</span>
                <strong>{displayTitle}</strong>
                <span>{application.name}</span>
                <div className="builder-app-card-actions">
                  <button
                    aria-label={`Open ${displayTitle} in runtime playground`}
                    onClick={() =>
                      onPreviewScreenRuntime({
                        appId: application.id,
                        configId: configuration.id,
                        screenId: screen.id,
                      })
                    }
                    type="button"
                  >
                    Open runtime
                  </button>
                  <button
                    aria-label={`Edit ${displayTitle} from playground`}
                    onClick={() =>
                      onOpenScreenBuilder({
                        appId: application.id,
                        configId: configuration.id,
                        screenId: screen.id,
                      })
                    }
                    type="button"
                  >
                    Edit screen
                  </button>
                  <button
                    aria-label={`Save ${displayTitle} as app`}
                    disabled={playgroundActionState.status === "promoting"}
                    onClick={async () => {
                      setPlaygroundActionState({ screenId: screen.id, status: "promoting" });
                      try {
                        await onCreateApplication(
                          configuration.id,
                          createApplicationFromPlaygroundScreen(screen, application, configuration.bundle.applications),
                        );
                        setPlaygroundActionState({ status: "idle" });
                      } catch (error) {
                        setPlaygroundActionState({ status: "error", message: getErrorMessage(error) });
                      }
                    }}
                    type="button"
                  >
                    {playgroundActionState.status === "promoting" && playgroundActionState.screenId === screen.id
                      ? "Saving..."
                      : "Save as app"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {playgroundActionState.status === "error" ? (
            <p className="builder-save-status builder-save-status-error" role="alert">
              {playgroundActionState.message}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function createDefaultWizardState(applications: readonly ApplicationConfig[]): CreateWizardState {
  return {
    includeOnboardingSpots: true,
    name: createNewApplicationName(applications),
    starterId: "operator-control",
    themePresetId: "extender-ui",
  };
}

function createGuidedApplication(
  wizard: CreateWizardState,
  existingApplications: readonly ApplicationConfig[],
): ApplicationConfig {
  const name = wizard.name.trim() || createNewApplicationName(existingApplications);
  const id = createUniqueApplicationId(slugify(name), existingApplications);
  const screen = createStarterScreen(wizard.starterId, wizard.includeOnboardingSpots);

  return {
    id,
    name,
    description: `${STARTER_SCREEN_LABELS[wizard.starterId]} starter app`,
    action_presets: DEFAULT_ACTION_PRESETS,
    runtime_policy: DEFAULT_RUNTIME_POLICY,
    theme: CREATE_THEME_PRESETS[wizard.themePresetId],
    profiles: [],
    screens: [screen],
  };
}

function createApplicationFromPlaygroundScreen(
  screen: ScreenConfig,
  sourceApplication: ApplicationConfig,
  existingApplications: readonly ApplicationConfig[],
): ApplicationConfig {
  const name = `${screen.title || "Playground"} Draft`;
  const id = createUniqueApplicationId(slugify(name), existingApplications);

  return {
    id,
    name,
    description: `Promoted from ${sourceApplication.name}`,
    action_presets: sourceApplication.action_presets,
    runtime_policy: sourceApplication.runtime_policy,
    theme: sourceApplication.theme,
    profiles: sourceApplication.profiles,
    screens: [
      {
        ...screen,
        id: "main",
        title: screen.title || "Main",
      },
    ],
  };
}

function createStarterScreen(starterId: StarterScreenId, includeOnboardingSpots: boolean): ScreenConfig {
  const onboardingWidgets = includeOnboardingSpots
    ? [
        {
          id: "onboarding-title",
          kind: "label" as const,
          title: "Onboarding title",
          layout: { x: 48, y: 36, width: 560, height: 86 },
          settings: {
            align: "left",
            fontSize: 28,
            text: "Name the operator task and replace this starter guidance.",
          },
        },
      ]
    : [];

  if (starterId === "debug-monitor") {
    return {
      id: "main",
      title: "Debug Monitor",
      canvas: { preset_id: "tablet", runtime_mode: "fit" },
      widgets: [
        ...onboardingWidgets,
        {
          id: "topic-echo",
          kind: "topic-echo",
          title: "Topic echo",
          layout: { x: 48, y: 152, width: 520, height: 240 },
          settings: { fieldPath: "", maxMessages: 40, messageType: "", prettyPrint: true, topic: "/teleop_cmd" },
        },
        {
          id: "runtime-events",
          kind: "event-log",
          title: "Runtime events",
          layout: { x: 608, y: 152, width: 540, height: 240 },
          settings: { entries: [], maxEntries: 6, severityFilter: ["success", "info", "warning", "error"] },
        },
      ],
    };
  }

  if (starterId === "operator-control") {
    return {
      id: "main",
      title: "Operator Controls",
      canvas: { preset_id: "tablet", runtime_mode: "fit" },
      widgets: [
        ...onboardingWidgets,
        {
          id: "teleop-joystick",
          kind: "joystick",
          title: "Teleop",
          layout: { x: 72, y: 160, width: 300, height: 300 },
          settings: {
            modeId: "both",
            runtimeBinding: { adapter: "teleop", value_mapping: { mode: 3, target_topic: "/teleop_cmd" } },
            zeroOnRelease: true,
          },
        },
        {
          id: "max-velocity",
          kind: "slider",
          title: "Max velocity",
          layout: { x: 440, y: 190, width: 440, height: 96 },
          settings: {
            max: 1,
            messageType: "std_msgs/msg/Float64",
            min: 0,
            step: 0.05,
            topic: "/cmd/max_velocity",
            value: 0.3,
          },
        },
      ],
    };
  }

  return {
    id: "main",
    title: "Main",
    canvas: { preset_id: "tablet", runtime_mode: "fit" },
    widgets: onboardingWidgets,
  };
}

function createUniqueApplicationId(baseId: string, applications: readonly ApplicationConfig[]): string {
  const existingIds = new Set(applications.map((application) => application.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function ScreenLibraryPreview({ screen, type }: { screen: ScreenConfig; type: ScreenLibraryType }) {
  const previewWidgets = screen.widgets.slice(0, 8);

  return (
    <div className="builder-screen-library-preview" data-screen-type={type}>
      <button
        aria-label={`Show ${screen.title || screen.id} layout preview`}
        className="builder-screen-library-preview-trigger"
        type="button"
      >
        Preview layout
      </button>
      <span aria-hidden="true" className="builder-screen-library-preview-popover">
        {previewWidgets.length === 0 ? (
          <span className="builder-screen-library-preview-empty">Empty canvas</span>
        ) : (
          previewWidgets.map((widget) => (
            <span
              className="builder-screen-library-preview-widget"
              data-widget-kind={widget.kind}
              key={widget.id}
              style={createPreviewWidgetStyle(widget.layout, screen)}
              title={`${widget.title} ${widget.kind}`}
            />
          ))
        )}
      </span>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom could not create this app.";
}
