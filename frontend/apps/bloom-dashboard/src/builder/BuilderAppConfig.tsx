import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";
import {
  addScreenToApplication,
  createUniqueId,
  duplicateScreenInApplication,
  removeScreenFromApplication,
} from "../configurations/configuration-editor";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";

type BuilderAppConfigProps = {
  configurations: readonly LoadedConfiguration[];
  onBackToHome: () => void;
  onOpenScreenBuilder: (selection: WorkspaceSelection) => void;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  selection: WorkspaceSelection;
};

type AppSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

type AvailableScreen = {
  screen: ScreenConfig;
  sourceApplicationName: string;
};

export function BuilderAppConfig({
  configurations,
  onBackToHome,
  onOpenScreenBuilder,
  onSaveApplication,
  selection,
}: BuilderAppConfigProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const { application } = selectedWorkspace;
  const [draftApplication, setDraftApplication] = useState(application);
  const [newScreenName, setNewScreenName] = useState("New screen");
  const [saveState, setSaveState] = useState<AppSaveState>({ status: "idle" });
  const availableScreens = collectAvailableScreens(selectedWorkspace.bundle.applications);
  const assignedScreenIds = new Set(draftApplication.screens.map((screen) => screen.id));
  const unassignedScreens = availableScreens.filter(({ screen }) => !assignedScreenIds.has(screen.id));
  const isDirty = JSON.stringify(draftApplication) !== JSON.stringify(application);
  const isSaving = saveState.status === "saving";

  useEffect(() => {
    setDraftApplication(application);
    setSaveState({ status: "idle" });
  }, [application]);

  const saveDraft = async () => {
    if (!isDirty || isSaving) {
      return;
    }

    setSaveState({ status: "saving" });
    try {
      await onSaveApplication(draftApplication);
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({ status: "error", message: getErrorMessage(error) });
    }
  };

  const addScreen = (screen: ScreenConfig) => {
    setDraftApplication((currentApplication) => addScreenToApplication(currentApplication, screen));
    setSaveState({ status: "idle" });
  };

  const createScreen = () => {
    const title = newScreenName.trim() || "New screen";

    setDraftApplication((currentApplication) =>
      addScreenToApplication(currentApplication, {
        id: createUniqueId(title, [
          ...availableScreens.map(({ screen }) => screen.id),
          ...currentApplication.screens.map((screen) => screen.id),
        ]),
        title,
        canvas: {
          preset_id: currentApplication.screens[0]?.canvas.preset_id ?? "tablet",
          runtime_mode: currentApplication.screens[0]?.canvas.runtime_mode ?? "fit",
        },
        widgets: [],
      }),
    );
    setNewScreenName("New screen");
    setSaveState({ status: "idle" });
  };

  const duplicateScreen = (screenId: string) => {
    setDraftApplication((currentApplication) => duplicateScreenInApplication(currentApplication, screenId));
    setSaveState({ status: "idle" });
  };

  const removeScreen = (screenId: string) => {
    setDraftApplication((currentApplication) => removeScreenFromApplication(currentApplication, screenId));
    setSaveState({ status: "idle" });
  };

  return (
    <section className="builder-app-config" aria-labelledby="builder-app-config-title">
      <header className="builder-app-config-header">
        <button className="builder-back-button" onClick={onBackToHome} type="button">
          Back to apps
        </button>
        <div className="builder-app-config-actions">
          <button disabled={!isDirty || isSaving} onClick={saveDraft} type="button">
            {isSaving ? "Saving..." : "Save app"}
          </button>
          <button
            disabled={!isDirty || isSaving}
            onClick={() => {
              setDraftApplication(application);
              setSaveState({ status: "idle" });
            }}
            type="button"
          >
            Discard
          </button>
        </div>
        <div>
          <p className="eyebrow">App configuration</p>
          <h1 id="builder-app-config-title">{draftApplication.name}</h1>
        </div>
        <AppSaveStatus state={saveState} />
      </header>

      <div className="builder-app-config-grid">
        <section className="builder-config-panel" aria-labelledby="builder-app-details-title">
          <div>
            <p className="eyebrow">Identity</p>
            <h2 id="builder-app-details-title">App details</h2>
          </div>
          <label className="builder-settings-field">
            <span>Name</span>
            <input
              onChange={(event) =>
                setDraftApplication({ ...draftApplication, name: event.target.value || "Untitled app" })
              }
              type="text"
              value={draftApplication.name}
            />
          </label>
          <label className="builder-settings-field">
            <span>Description</span>
            <textarea
              onChange={(event) => setDraftApplication({ ...draftApplication, description: event.target.value })}
              rows={4}
              value={draftApplication.description}
            />
          </label>
        </section>

        <section className="builder-config-panel" aria-labelledby="builder-theme-title">
          <div>
            <p className="eyebrow">Design system</p>
            <h2 id="builder-theme-title">App theme</h2>
          </div>
          <p className="builder-inspector-copy">
            Each app can carry its own coherent palette. Bloom keeps this simple for now, then future templates can
            generate richer design systems from moodboards or presets.
          </p>
          <fieldset className="builder-theme-swatches">
            <legend>Application palette</legend>
            {Object.entries(draftApplication.theme.palette).map(([key, value]) => (
              <label className="builder-theme-swatch" key={key}>
                <span>{key}</span>
                <input
                  aria-label={`${key} color`}
                  onChange={(event) =>
                    setDraftApplication({
                      ...draftApplication,
                      theme: {
                        ...draftApplication.theme,
                        palette: {
                          ...draftApplication.theme.palette,
                          [key]: event.target.value,
                        },
                      },
                    })
                  }
                  type="color"
                  value={value}
                />
              </label>
            ))}
          </fieldset>
        </section>

        <section className="builder-config-panel builder-screens-panel" aria-labelledby="builder-screens-title">
          <div>
            <p className="eyebrow">Screens</p>
            <h2 id="builder-screens-title">Screen list</h2>
          </div>
          <div className="builder-screen-create-card">
            <div>
              <h3>Create a screen</h3>
              <p className="builder-inspector-copy">
                Start from a blank screen, then save the app before opening it in the WYSIWYG builder.
              </p>
            </div>
            <label className="builder-settings-field">
              <span>New screen name</span>
              <input onChange={(event) => setNewScreenName(event.target.value)} type="text" value={newScreenName} />
            </label>
            <button disabled={isSaving} onClick={createScreen} type="button">
              Create screen
            </button>
          </div>
          <div className="builder-screen-membership">
            <div>
              <h3>Screens in this app</h3>
              <div className="builder-screen-cards">
                {draftApplication.screens.map((screen) => (
                  <article className="builder-screen-card" key={screen.id}>
                    <div>
                      <strong>{screen.title}</strong>
                      <span>
                        {screen.widgets.length} widgets · {screen.canvas.preset_id}
                      </span>
                    </div>
                    <div className="builder-screen-card-actions">
                      <button
                        aria-label={`Open ${screen.title} screen builder`}
                        disabled={isDirty || isSaving}
                        onClick={() =>
                          onOpenScreenBuilder({
                            appId: application.id,
                            configId: selectedWorkspace.configuration.id,
                            screenId: screen.id,
                          })
                        }
                        type="button"
                      >
                        Open builder
                      </button>
                      <button
                        aria-label={`Remove ${screen.title} from app`}
                        className="builder-screen-action-danger"
                        disabled={draftApplication.screens.length <= 1 || isSaving}
                        onClick={() => removeScreen(screen.id)}
                        type="button"
                      >
                        Remove
                      </button>
                      <button
                        aria-label={`Duplicate ${screen.title} screen`}
                        disabled={isSaving}
                        onClick={() => duplicateScreen(screen.id)}
                        type="button"
                      >
                        Duplicate
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div>
              <h3>Available screens</h3>
              <p className="builder-inspector-copy">
                Pick reusable screens from other apps in this configuration. SQLite will turn this into a dedicated
                screen library later.
              </p>
              <div className="builder-screen-cards">
                {unassignedScreens.length === 0 ? (
                  <p className="builder-empty-state">
                    All existing screens from this configuration are already in this app.
                  </p>
                ) : (
                  unassignedScreens.map(({ screen, sourceApplicationName }) => (
                    <article className="builder-screen-card" key={`${sourceApplicationName}-${screen.id}`}>
                      <div>
                        <strong>{screen.title}</strong>
                        <span>
                          {screen.widgets.length} widgets · {screen.canvas.preset_id}
                        </span>
                        <small>From {sourceApplicationName}</small>
                      </div>
                      <div className="builder-screen-card-actions">
                        <button
                          aria-label={`Add ${screen.title} to app`}
                          disabled={isSaving}
                          onClick={() => addScreen(screen)}
                          type="button"
                        >
                          Add to app
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function collectAvailableScreens(applications: readonly ApplicationConfig[]): AvailableScreen[] {
  const screensById = new Map<string, AvailableScreen>();

  for (const application of applications) {
    for (const screen of application.screens) {
      if (!screensById.has(screen.id)) {
        screensById.set(screen.id, {
          screen,
          sourceApplicationName: application.name,
        });
      }
    }
  }

  return [...screensById.values()];
}

function AppSaveStatus({ state }: { state: AppSaveState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "error") {
    return (
      <p className="builder-save-status builder-save-status-error" role="alert">
        {state.message}
      </p>
    );
  }

  return (
    <p className="builder-save-status" role="status">
      {state.status === "saving" ? "Saving app..." : "App configuration saved."}
    </p>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom could not save this app configuration.";
}
