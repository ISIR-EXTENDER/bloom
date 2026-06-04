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
import {
  BLOOM_SCREEN_DRAG_TYPE,
  canReceiveBloomDrag,
  readBloomDragPayload,
  writeBloomDragPayload,
} from "../ui/dragDrop";
import { getTouchEditingProps } from "../ui/touchEditing";

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

type ScreenFeature = "camera" | "controls" | "debug" | "empty" | "interface";

type ScreenCardAction = {
  ariaLabel: string;
  disabled?: boolean;
  isDanger?: boolean;
  label: string;
  onClick: () => void;
};

const MAX_MOODBOARD_IMAGE_BYTES = 1_000_000;
const ACCEPTED_MOODBOARD_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_THEME_INSPIRATION: ApplicationConfig["theme"]["inspiration"] = {
  moodboard_image_uri: "",
  reference_url: "",
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
  const [themeInspirationError, setThemeInspirationError] = useState("");
  const availableScreens = collectAvailableScreens(selectedWorkspace.bundle.applications);
  const assignedScreenIds = new Set(draftApplication.screens.map((screen) => screen.id));
  const unassignedScreens = availableScreens.filter(({ screen }) => !assignedScreenIds.has(screen.id));
  const availableScreenGroups = groupAvailableScreensByFeature(unassignedScreens);
  const isDirty = JSON.stringify(draftApplication) !== JSON.stringify(application);
  const isSaving = saveState.status === "saving";
  const themeInspiration = draftApplication.theme.inspiration ?? DEFAULT_THEME_INSPIRATION;
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

  const addScreenById = (screenId: string) => {
    const availableScreen = unassignedScreens.find(({ screen }) => screen.id === screenId);
    if (!availableScreen) {
      return;
    }

    addScreen(availableScreen.screen);
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
          ...(currentApplication.theme.inspiration ?? DEFAULT_THEME_INSPIRATION),
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
                {...getTouchEditingProps("name")}
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
                {...getTouchEditingProps("text")}
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
              {themeInspiration.moodboard_image_uri ? (
                <img alt="Current app moodboard preview" src={themeInspiration.moodboard_image_uri} />
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
                  {...getTouchEditingProps("url")}
                  onChange={(event) => updateThemeInspiration({ reference_url: event.target.value })}
                  placeholder="https://example.com/inspiration"
                  type="url"
                  value={themeInspiration.reference_url}
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
              <input
                {...getTouchEditingProps("name")}
                onChange={(event) => setNewScreenName(event.target.value)}
                type="text"
                value={newScreenName}
              />
            </label>
            <button disabled={isSaving} onClick={createScreen} type="button">
              Create screen
            </button>
          </div>
          <div className="builder-screen-membership">
            <div>
              <div className="builder-screen-section-heading">
                <h3>Screens in this app</h3>
                <span>{draftApplication.screens.length}</span>
              </div>
              {isDirty ? (
                <p className="builder-inline-hint">Save or discard app changes before opening a screen builder.</p>
              ) : null}
              <section
                aria-label="Screens currently assigned to this app. Drop reusable screens here to add them."
                className="builder-screen-cards builder-screen-dropzone"
                onDragOver={(event) => {
                  if (canReceiveBloomDrag(event.dataTransfer, BLOOM_SCREEN_DRAG_TYPE)) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  addScreenById(readBloomDragPayload(event.dataTransfer, BLOOM_SCREEN_DRAG_TYPE));
                }}
              >
                {draftApplication.screens.map((screen) => (
                  <ScreenCard
                    actions={[
                      {
                        ariaLabel: `Open ${screen.title} screen builder`,
                        disabled: isDirty || isSaving,
                        label: "Open builder",
                        onClick: () =>
                          onOpenScreenBuilder({
                            appId: application.id,
                            configId: selectedWorkspace.configuration.id,
                            screenId: screen.id,
                          }),
                      },
                      {
                        ariaLabel: `Remove ${screen.title} from app`,
                        disabled: draftApplication.screens.length <= 1 || isSaving,
                        isDanger: true,
                        label: "Remove",
                        onClick: () => removeScreen(screen.id),
                      },
                      {
                        ariaLabel: `Duplicate ${screen.title} screen`,
                        disabled: isSaving,
                        label: "Duplicate",
                        onClick: () => duplicateScreen(screen.id),
                      },
                    ]}
                    key={screen.id}
                    screen={screen}
                  />
                ))}
              </section>
            </div>

            <div>
              <div className="builder-screen-section-heading">
                <h3>Available screens</h3>
                <span>{unassignedScreens.length}</span>
              </div>
              <p className="builder-inspector-copy">
                Reuse screens from any app in this configuration. Drag one into the app flow, or use the button
                fallback.
              </p>
              <div className="builder-screen-available-groups">
                {unassignedScreens.length === 0 ? (
                  <p className="builder-empty-state">No extra reusable screens available yet.</p>
                ) : (
                  availableScreenGroups.map((group) => (
                    <section
                      className="builder-screen-available-group"
                      key={group.feature}
                      style={createFeatureAccentStyle(group.feature)}
                    >
                      <div className="builder-screen-available-group-heading">
                        <h4>{SCREEN_FEATURE_LABELS[group.feature]}</h4>
                        <span>{group.screens.length}</span>
                      </div>
                      <div className="builder-screen-cards">
                        {group.screens.map(({ screen, sourceApplicationName }) => (
                          <ScreenCard
                            actions={[
                              {
                                ariaLabel: `Add ${screen.title} to app`,
                                disabled: isSaving,
                                label: "Add to app",
                                onClick: () => addScreen(screen),
                              },
                            ]}
                            draggable={!isSaving}
                            key={`${sourceApplicationName}-${screen.id}`}
                            screen={screen}
                            sourceApplicationName={sourceApplicationName}
                          />
                        ))}
                      </div>
                    </section>
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

function ScreenCard({
  actions,
  draggable = false,
  screen,
  sourceApplicationName,
}: {
  actions: readonly ScreenCardAction[];
  draggable?: boolean;
  screen: ScreenConfig;
  sourceApplicationName?: string;
}) {
  return (
    <article
      className="builder-screen-card"
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) {
          return;
        }
        writeBloomDragPayload(event.dataTransfer, BLOOM_SCREEN_DRAG_TYPE, screen.id);
      }}
      style={createScreenAccentStyle(screen)}
    >
      <div className="builder-screen-card-main">
        <strong>{screen.title}</strong>
        <div className="builder-screen-card-details">
          <span>{describeScreenFeature(screen)}</span>
          {sourceApplicationName ? <span>From {sourceApplicationName}</span> : null}
        </div>
      </div>
      <div className="builder-screen-card-actions">
        {actions.map((action) => (
          <button
            aria-label={action.ariaLabel}
            className={action.isDanger ? "builder-screen-action-danger" : undefined}
            disabled={action.disabled}
            key={action.label}
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}

function createScreenAccentStyle(screen: ScreenConfig): CSSProperties {
  return { "--screen-card-accent": resolveScreenAccent(screen) } as CSSProperties;
}

function createFeatureAccentStyle(feature: ScreenFeature): CSSProperties {
  return { "--screen-card-accent": SCREEN_FEATURE_COLORS[feature] } as CSSProperties;
}

function describeScreenFeature(screen: ScreenConfig): string {
  return SCREEN_FEATURE_LABELS[resolveScreenFeature(screen)];
}

function resolveScreenFeature(screen: ScreenConfig): ScreenFeature {
  if (screen.widgets.length === 0) {
    return "empty";
  }

  if (screen.widgets.some((widget) => widget.kind === "camera")) {
    return "camera";
  }

  if (screen.widgets.some((widget) => widget.kind === "joystick" || widget.kind === "slider")) {
    return "controls";
  }

  if (screen.widgets.some((widget) => widget.kind === "topic-echo" || widget.kind === "topic-plot")) {
    return "debug";
  }

  return "interface";
}

function resolveScreenAccent(screen: ScreenConfig): string {
  return SCREEN_FEATURE_COLORS[resolveScreenFeature(screen)];
}

function groupAvailableScreensByFeature(screens: readonly AvailableScreen[]) {
  return SCREEN_FEATURE_ORDER.map((feature) => ({
    feature,
    screens: screens.filter(({ screen }) => resolveScreenFeature(screen) === feature),
  })).filter((group) => group.screens.length > 0);
}

const SCREEN_FEATURE_LABELS = {
  camera: "Camera views",
  controls: "Control screens",
  debug: "Debug screens",
  empty: "Blank starters",
  interface: "Interface screens",
} satisfies Record<ScreenFeature, string>;

const SCREEN_FEATURE_COLORS = {
  camera: "var(--bloom-color-mist)",
  controls: "var(--bloom-color-pollen)",
  debug: "var(--bloom-color-lilac)",
  empty: "var(--bloom-color-petal)",
  interface: "var(--bloom-color-sage)",
} satisfies Record<ScreenFeature, string>;

const SCREEN_FEATURE_ORDER: readonly ScreenFeature[] = ["controls", "camera", "debug", "interface", "empty"];

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
