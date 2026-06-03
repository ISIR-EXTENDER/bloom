import { type ApplicationConfig, DEFAULT_APPLICATION_THEME } from "@bloom/api-client";
import { useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";

type BuilderHomeProps = {
  configurations: readonly LoadedConfiguration[];
  onCreateApplication: (configId: string, application: ApplicationConfig) => Promise<void>;
  onDeleteApplication: (configId: string, applicationId: string) => Promise<void>;
  onDuplicateApplication: (configId: string, applicationId: string) => Promise<void>;
  onOpenApplication: (selection: WorkspaceSelection) => void;
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
}: BuilderHomeProps) {
  const firstConfiguration = configurations[0];
  const [createState, setCreateState] = useState<CreateState>({ status: "idle" });
  const [appActionState, setAppActionState] = useState<AppActionState>({ status: "idle" });
  const isCreating = createState.status === "creating";
  const applications = configurations.flatMap((configuration) =>
    configuration.bundle.applications.map((application) => ({ application, configuration })),
  );

  return (
    <section className="builder-home" aria-labelledby="builder-home-title">
      <header className="builder-home-hero">
        <div>
          <p className="eyebrow">Builder</p>
          <h1 id="builder-home-title">Choose an app to shape.</h1>
          <p>
            Start from an existing robot interface, create a new app, then open each screen in the full-page WYSIWYG
            builder.
          </p>
        </div>
      </header>

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
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete "${application.name}" from configuration "${configuration.id}"? This cannot be undone.`,
                            )
                          ) {
                            return;
                          }

                          setAppActionState({ applicationId: application.id, status: "deleting" });
                          try {
                            await onDeleteApplication(configuration.id, application.id);
                            setAppActionState({ status: "idle" });
                          } catch (error) {
                            setAppActionState({ status: "error", message: getErrorMessage(error) });
                          }
                        }}
                        type="button"
                      >
                        {isActingOnThisApp && actionState?.status === "deleting" ? "Deleting..." : "Delete"}
                      </button>
                    </div>
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
            <h2 id="builder-create-title">New app foundation</h2>
          </div>
          <p>
            Create a blank app with a first empty screen and the Bloom default design system. More templates can plug
            into this flow later.
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
                  theme: DEFAULT_APPLICATION_THEME,
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
            {isCreating ? "Creating..." : "Create blank app"}
          </button>
          {createState.status === "error" ? (
            <p className="builder-save-status builder-save-status-error" role="alert">
              {createState.message}
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom could not create this app.";
}

function createNewApplicationName(applications: readonly ApplicationConfig[]): string {
  const baseName = "New Bloom App";
  if (!applications.some((application) => application.name === baseName)) {
    return baseName;
  }

  let suffix = 2;
  while (applications.some((application) => application.name === `${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "bloom-app"
  );
}
