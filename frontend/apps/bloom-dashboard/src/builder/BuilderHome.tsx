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
type AppActionState =
  | { status: "idle" }
  | { applicationId: string; status: "deleting" | "duplicating" }
  | { message: string; status: "error" };

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
  const [screenSearch, setScreenSearch] = useState("");
  const isCreating = createState.status === "creating";
  const applications = createBuilderApplicationItems(configurations);
  const screens = createScreenLibraryItems(applications);
  const filteredScreens = filterScreens(screens, screenSearch);
  const screenGroups = groupScreensByType(filteredScreens);

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
              <h2 id="builder-create-title">Create an app</h2>
            </div>
            <p>
              Start with a named app, a first main screen, and the Bloom default design system. The next wizard steps
              will add starter screens, presets, and onboarding attention spots.
            </p>
            <button
              disabled={!firstConfiguration || isCreating}
              onClick={async () => {
                if (!firstConfiguration) {
                  return;
                }
                const name = createNewApplicationName(firstConfiguration.bundle.applications);
                const id = slugify(name);
                setCreateState({ status: "creating" });
                try {
                  await onCreateApplication(firstConfiguration.id, {
                    id,
                    name,
                    description: "New Bloom app",
                    action_presets: DEFAULT_ACTION_PRESETS,
                    runtime_policy: DEFAULT_RUNTIME_POLICY,
                    theme: DEFAULT_APPLICATION_THEME,
                    profiles: [],
                    screens: [
                      {
                        id: "main",
                        title: "Main",
                        canvas: { preset_id: "tablet", runtime_mode: "fit" },
                        widgets: [],
                      },
                    ],
                  });
                  setCreateState({ status: "idle" });
                } catch (error) {
                  setCreateState({ status: "error", message: getErrorMessage(error) });
                }
              }}
              type="button"
            >
              {isCreating ? "Creating..." : "Create starter app"}
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
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
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
