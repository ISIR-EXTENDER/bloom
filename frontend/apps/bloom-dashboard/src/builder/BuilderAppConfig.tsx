import type { ApplicationConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";
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
  const [saveState, setSaveState] = useState<AppSaveState>({ status: "idle" });
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
          <div className="builder-screen-cards">
            {application.screens.map((screen) => (
              <button
                className="builder-screen-card"
                key={screen.id}
                onClick={() =>
                  onOpenScreenBuilder({
                    appId: application.id,
                    configId: selectedWorkspace.configuration.id,
                    screenId: screen.id,
                  })
                }
                type="button"
              >
                <strong>{screen.title}</strong>
                <span>
                  {screen.widgets.length} widgets · {screen.canvas.preset_id}
                </span>
                <small>Open screen builder</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
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
