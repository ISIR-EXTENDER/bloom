import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import type { CSSProperties } from "react";
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

const MAX_MOODBOARD_IMAGE_BYTES = 1_000_000;
const ACCEPTED_MOODBOARD_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const [themeInspirationError, setThemeInspirationError] = useState("");
  const availableScreens = collectAvailableScreens(selectedWorkspace.bundle.applications);
  const assignedScreenIds = new Set(draftApplication.screens.map((screen) => screen.id));
  const unassignedScreens = availableScreens.filter(({ screen }) => !assignedScreenIds.has(screen.id));
  const isDirty = JSON.stringify(draftApplication) !== JSON.stringify(application);
  const isSaving = saveState.status === "saving";
  const palettePreview = Object.entries(draftApplication.theme.palette);

  useEffect(() => {
    setDraftApplication(application);
    setSaveState({ status: "idle" });
    setThemeInspirationError("");
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

  const updateThemeInspiration = (nextInspiration: Partial<ApplicationConfig["theme"]["inspiration"]>) => {
    setDraftApplication((currentApplication) => ({
      ...currentApplication,
      theme: {
        ...currentApplication.theme,
        inspiration: {
          ...currentApplication.theme.inspiration,
          ...nextInspiration,
        },
      },
    }));
    setThemeInspirationError("");
    setSaveState({ status: "idle" });
  };

  const loadMoodboardFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!ACCEPTED_MOODBOARD_IMAGE_TYPES.has(file.type)) {
      setThemeInspirationError("Use a PNG, JPEG, or WebP image for the moodboard.");
      return;
    }

    if (file.size > MAX_MOODBOARD_IMAGE_BYTES) {
      setThemeInspirationError("Keep moodboard images under 1 MB for now. Asset upload will replace this later.");
      return;
    }

    try {
      updateThemeInspiration({ moodboard_image_uri: await readFileAsDataUrl(file) });
    } catch (error) {
      setThemeInspirationError(getErrorMessage(error));
    }
  };

  return (
    <section className="builder-app-config" aria-labelledby="builder-app-config-title">
      <header className="builder-app-config-header">
        <div>
          <p className="eyebrow">App configuration</p>
          <h1 id="builder-app-config-title">{draftApplication.name}</h1>
          <p>
            Configure the app identity, visual language, and screens before opening a screen in the full WYSIWYG
            builder.
          </p>
          <div className="builder-app-summary">
            <span>{draftApplication.screens.length} screens</span>
            <span>{draftApplication.screens.reduce((count, screen) => count + screen.widgets.length, 0)} widgets</span>
            <span>{draftApplication.theme.preset_id}</span>
          </div>
        </div>
        <div className="builder-app-config-actions">
          <button className="builder-back-button" onClick={onBackToHome} type="button">
            Back to apps
          </button>
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
        <AppSaveStatus state={saveState} />
      </header>

      <div className="builder-app-config-grid">
        <aside className="builder-app-config-sidebar" aria-label="Application settings">
          <section className="builder-config-panel" aria-labelledby="builder-app-details-title">
            <div className="builder-config-panel-header">
              <div>
                <p className="eyebrow">Identity</p>
                <h2 id="builder-app-details-title">App details</h2>
              </div>
              <span className="builder-section-badge">{isDirty ? "Draft" : "Saved"}</span>
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
            <div className="builder-config-panel-header">
              <div>
                <p className="eyebrow">Design system</p>
                <h2 id="builder-theme-title">App theme</h2>
              </div>
            </div>
            <p className="builder-inspector-copy">
              Each app can carry its own coherent palette. Bloom keeps this simple for now, then future templates can
              generate richer design systems from moodboards or presets.
            </p>
            <div className="builder-theme-inspiration">
              <div>
                <h3>Theme inspiration</h3>
                <p className="builder-inspector-copy">
                  Save a moodboard image or website reference with the app. Bloom will later use this as input for
                  coherent app-specific design system generation.
                </p>
              </div>
              {draftApplication.theme.inspiration.moodboard_image_uri ? (
                <img alt="Current app moodboard preview" src={draftApplication.theme.inspiration.moodboard_image_uri} />
              ) : (
                <div className="builder-theme-inspiration-empty">No moodboard image yet.</div>
              )}
              <label className="builder-settings-field">
                <span>Moodboard image</span>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    void loadMoodboardFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <label className="builder-settings-field">
                <span>Website reference</span>
                <input
                  onChange={(event) => updateThemeInspiration({ reference_url: event.target.value })}
                  placeholder="https://example.com/inspiration"
                  type="url"
                  value={draftApplication.theme.inspiration.reference_url}
                />
              </label>
              {themeInspirationError ? <p className="builder-inline-error">{themeInspirationError}</p> : null}
            </div>
            <fieldset className="builder-theme-swatches">
              <legend>Application palette</legend>
              <div className="builder-theme-preview">
                {palettePreview.map(([key, value]) => (
                  <span key={key} style={{ background: value }} title={key} />
                ))}
              </div>
              {palettePreview.map(([key, value]) => (
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
        </aside>

        <section className="builder-config-panel builder-screens-panel" aria-labelledby="builder-screens-title">
          <div className="builder-config-panel-header">
            <div>
              <p className="eyebrow">Screens</p>
              <h2 id="builder-screens-title">Build this app flow</h2>
            </div>
            <span className="builder-section-badge">{draftApplication.screens.length} screens</span>
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
              {isDirty ? (
                <p className="builder-inline-hint">Save or discard app changes before opening a screen builder.</p>
              ) : null}
              <div className="builder-screen-cards">
                {draftApplication.screens.map((screen) => (
                  <article className="builder-screen-card" key={screen.id} style={createScreenAccentStyle(screen)}>
                    <div>
                      <strong>{screen.title}</strong>
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
                    <article
                      className="builder-screen-card"
                      key={`${sourceApplicationName}-${screen.id}`}
                      style={createScreenAccentStyle(screen)}
                    >
                      <div>
                        <strong>{screen.title}</strong>
                        <span>From {sourceApplicationName}</span>
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

function createScreenAccentStyle(screen: ScreenConfig): CSSProperties {
  return { "--screen-card-accent": resolveScreenAccent(screen) } as CSSProperties;
}

function resolveScreenAccent(screen: ScreenConfig): string {
  if (screen.widgets.some((widget) => widget.kind === "camera")) {
    return "var(--bloom-color-mist)";
  }

  if (screen.widgets.some((widget) => widget.kind === "joystick" || widget.kind === "slider")) {
    return "var(--bloom-color-pollen)";
  }

  if (screen.widgets.some((widget) => widget.kind === "topic-echo" || widget.kind === "topic-plot")) {
    return "var(--bloom-color-lilac)";
  }

  if (screen.widgets.length === 0) {
    return "var(--bloom-color-petal)";
  }

  return "var(--bloom-color-sage)";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Moodboard image could not be read."));
    });
    reader.addEventListener("error", () => reject(new Error("Moodboard image could not be read.")));
    reader.readAsDataURL(file);
  });
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
