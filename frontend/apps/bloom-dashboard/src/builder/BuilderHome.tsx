import { type ApplicationConfig, DEFAULT_APPLICATION_THEME, type ScreenConfig } from "@bloom/api-client";
import { useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";

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

type ScreenLibraryType = "camera" | "control" | "debug" | "device" | "workflow" | "general";

type ScreenLibraryItem = {
  application: ApplicationConfig;
  configuration: LoadedConfiguration;
  displayTitle: string;
  screen: ScreenConfig;
  type: ScreenLibraryType;
};

const SCREEN_LIBRARY_GROUPS: readonly { description: string; label: string; type: ScreenLibraryType }[] = [
  {
    type: "camera",
    label: "Camera views",
    description: "Video, webcam, and stream inspection screens.",
  },
  {
    type: "control",
    label: "Control screens",
    description: "Teleoperation, joystick, slider, and command-oriented screens.",
  },
  {
    type: "debug",
    label: "Debug monitors",
    description: "Topic echoes, plots, logs, and diagnostics screens.",
  },
  {
    type: "device",
    label: "Device panels",
    description: "Reusable controls for grippers, pumps, magnets, sensors, and devices.",
  },
  {
    type: "workflow",
    label: "Workflow screens",
    description: "App-specific steps, state flows, and configuration screens.",
  },
  {
    type: "general",
    label: "General screens",
    description: "Reusable layouts that do not belong to a specialized family yet.",
  },
];

const SCREEN_LIBRARY_TYPE_LABELS: Record<ScreenLibraryType, string> = {
  camera: "Camera",
  control: "Control",
  debug: "Debug",
  device: "Device",
  workflow: "Workflow",
  general: "General",
};

const SCREEN_TITLE_ACRONYMS: Record<string, string> = {
  api: "API",
  hd: "HD",
  ros: "ROS",
  ui: "UI",
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
  const [screenSearch, setScreenSearch] = useState("");
  const isCreating = createState.status === "creating";
  const applications = configurations.flatMap((configuration) =>
    configuration.bundle.applications.map((application) => ({ application, configuration })),
  );
  const screens = createScreenLibraryItems(applications);
  const filteredScreens = filterScreens(screens, screenSearch);
  const screenGroups = groupScreensByType(filteredScreens);

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

      <section className="builder-screen-library" aria-labelledby="builder-screen-library-title">
        <div className="builder-screen-library-heading">
          <div>
            <p className="eyebrow">Screen library</p>
            <h2 id="builder-screen-library-title">Reusable screens</h2>
          </div>
          <span>{filteredScreens.length} screens</span>
        </div>
        <p>
          Work directly from reusable screens when you want to design a control, camera, or debug view before assigning
          it to a specific app flow.
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

function createScreenLibraryItems(
  applications: readonly { application: ApplicationConfig; configuration: LoadedConfiguration }[],
): ScreenLibraryItem[] {
  return applications.flatMap(({ application, configuration }) =>
    application.screens.map((screen) => ({
      application,
      configuration,
      displayTitle: formatScreenTitle(screen.title || screen.id),
      screen,
      type: classifyScreen(screen),
    })),
  );
}

function groupScreensByType(screens: readonly ScreenLibraryItem[]) {
  return SCREEN_LIBRARY_GROUPS.map((definition) => ({
    definition,
    items: screens.filter((screen) => screen.type === definition.type),
  })).filter((group) => group.items.length > 0);
}

function filterScreens(screens: readonly ScreenLibraryItem[], search: string): ScreenLibraryItem[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return [...screens];
  }

  return screens.filter(({ application, configuration, displayTitle, screen, type }) => {
    const searchableText = [
      application.name,
      configuration.id,
      displayTitle,
      SCREEN_LIBRARY_TYPE_LABELS[type],
      screen.id,
      screen.title,
      ...screen.widgets.map((widget) => widget.kind),
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedSearch);
  });
}

function classifyScreen(screen: ScreenConfig): ScreenLibraryType {
  const screenText = `${screen.id} ${screen.title}`.toLowerCase();
  const widgetKinds = new Set(screen.widgets.map((widget) => widget.kind));

  if (widgetKinds.has("camera") || includesAny(screenText, ["camera", "stream", "video", "webcam"])) {
    return "camera";
  }

  if (
    widgetKinds.has("joystick") ||
    widgetKinds.has("slider") ||
    widgetKinds.has("button") ||
    widgetKinds.has("command-button") ||
    widgetKinds.has("toggle") ||
    includesAny(screenText, ["control", "drive", "teleop", "command"])
  ) {
    return "control";
  }

  if (
    widgetKinds.has("gauge") ||
    widgetKinds.has("plot") ||
    widgetKinds.has("topic-echo") ||
    widgetKinds.has("topic-plot") ||
    includesAny(screenText, ["debug", "diagnostic", "log", "monitor", "topic"])
  ) {
    return "debug";
  }

  if (includesAny(screenText, ["device", "gripper", "magnet", "pump", "sensor", "actuator"])) {
    return "device";
  }

  if (includesAny(screenText, ["config", "state", "workflow", "petanque", "setup"])) {
    return "workflow";
  }

  return "general";
}

function formatScreenTitle(title: string): string {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return "Untitled Screen";
  }

  return normalizedTitle
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => SCREEN_TITLE_ACRONYMS[word.toLowerCase()] ?? capitalize(word))
    .join(" ");
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}
