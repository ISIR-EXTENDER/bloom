import type { ApplicationConfig, ScreenConfig, ShareStatus } from "@bloom/api-client";
import { useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { describeApiError } from "../ui/api-error";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import {
  type CreateThemePresetId,
  type CreateWizardState,
  createApplicationFromPlaygroundScreen,
  createDefaultWizardState,
  createGuidedApplication,
  STARTER_SCREEN_LABELS,
  type StarterScreenId,
} from "./builder-starters";
import {
  type BuilderHomeSection,
  countLabel,
  createBuilderApplicationItems,
  createPreviewWidgetStyle,
  createScreenLibraryItems,
  filterScreens,
  groupScreensByType,
  SCREEN_LIBRARY_TYPE_LABELS,
  type ScreenLibraryType,
  selectPlaygroundScreens,
} from "./builderHomeModel";

type BuilderHomeProps = {
  configurations: readonly LoadedConfiguration[];
  onCreateApplication: (configId: string, application: ApplicationConfig) => Promise<void>;
  onDeleteApplication: (configId: string, applicationId: string) => Promise<void>;
  onDuplicateApplication: (configId: string, applicationId: string) => Promise<void>;
  onOpenApplication: (selection: WorkspaceSelection) => void;
  onOpenScreenBuilder: (selection: WorkspaceSelection) => void;
  onPreviewScreenRuntime: (selection: WorkspaceSelection) => void;
  /** Where each configuration stands against the shipped one; a server that cannot say leaves it empty. */
  shareStatus?: Record<string, ShareStatus>;
  onPublishConfiguration?: (
    configId: string,
  ) => Promise<{ path: string; alreadyPublished: boolean; warnings?: string[] }>;
  onTakeShippedConfiguration?: (configId: string) => Promise<unknown>;
  /** The arm this Bloom drives, so a starter's pad and gripper match it. */
  robotName?: string;
};

type ShareActionState =
  | { status: "idle" }
  | { configId: string; status: "publishing" | "taking" }
  | { configId: string; status: "published"; path: string; alreadyPublished: boolean; warnings?: string[] }
  | { message: string; status: "error" };

/** What the badge says, and what the one button under it does. Statuses with nothing to do show nothing. */
const SHARE_BADGES: Partial<Record<ShareStatus, { label: string; action: "publish" | "take" | null; hint: string }>> = {
  edited: {
    action: "publish",
    hint: "Edited on this machine. Share writes the file the team gets on clone; commit it afterwards.",
    label: "Edited here",
  },
  local: {
    action: "publish",
    hint: "Only on this machine. Share writes the file the team gets on clone; commit it afterwards.",
    label: "Not shared",
  },
  outdated: {
    action: "take",
    hint: "The repository has a newer version and nobody edited this copy.",
    label: "Update available",
  },
  shared: { action: null, hint: "Same as the version in the repository.", label: "Shared" },
};

type CreateState = { status: "idle" } | { status: "creating" } | { status: "error"; message: string };
type AppActionState =
  | { status: "idle" }
  | { applicationId: string; status: "deleting" | "duplicating" }
  | { message: string; status: "error" };
type PlaygroundActionState =
  | { status: "idle" }
  | { screenId: string; status: "promoting" }
  | { message: string; status: "error" };

export function BuilderHome({
  configurations,
  onCreateApplication,
  onDeleteApplication,
  onDuplicateApplication,
  onOpenApplication,
  onOpenScreenBuilder,
  onPreviewScreenRuntime,
  shareStatus = {},
  onPublishConfiguration,
  onTakeShippedConfiguration,
  robotName,
}: BuilderHomeProps) {
  const [shareAction, setShareAction] = useState<ShareActionState>({ status: "idle" });
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
            <span>
              {countLabel(applications.length, "app")} ready for configuration, runtime launch, duplication, or
              deletion.
            </span>
          </button>
          <button className="builder-overview-card" onClick={() => setActiveSection("screens")} type="button">
            <span className="builder-overview-card-kicker">Screens</span>
            <strong>Design reusable screens first</strong>
            <span>{countLabel(screens.length, "screen")} available across the shared library and existing apps.</span>
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
                        {countLabel(application.screens.length, "screen")} · {configuration.id}
                      </small>
                      <ShareBadge
                        appCount={configuration.bundle.applications.length}
                        configId={configuration.id}
                        onPublish={onPublishConfiguration}
                        onTakeShipped={onTakeShippedConfiguration}
                        setState={setShareAction}
                        state={shareAction}
                        status={shareStatus[configuration.id]}
                      />
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
                              setAppActionState({
                                status: "error",
                                message: describeApiError(error, "Bloom could not duplicate this app."),
                              });
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
                                  setAppActionState({
                                    status: "error",
                                    message: describeApiError(error, "Bloom could not delete this app."),
                                  });
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
            {shareAction.status === "error" ? (
              <p className="builder-save-status builder-save-status-error" role="alert">
                {shareAction.message}
              </p>
            ) : null}
            {shareAction.status === "published" ? (
              <p className="builder-save-status" role="status">
                {shareAction.alreadyPublished
                  ? `${shareAction.configId} already matches ${shareAction.path}; nothing to commit.`
                  : `Written to ${shareAction.path}. Commit that file to share it with the team.`}
                {shareAction.warnings?.length ? ` ${shareAction.warnings.join(" ")}` : ""}
              </p>
            ) : null}
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
                const application = createGuidedApplication(
                  createWizard,
                  firstConfiguration.bundle.applications,
                  robotName,
                );
                setCreateState({ status: "creating" });
                // Shipped ids too, deleted ones included: a new app under one would share over its file.
                const configIds = new Set([
                  ...configurations.map((configuration) => configuration.id),
                  ...Object.keys(shareStatus),
                ]);
                let configId = application.id;
                for (let suffix = 2; configIds.has(configId); suffix += 1) {
                  configId = `${application.id}-${suffix}`;
                }
                try {
                  await onCreateApplication(configId, application);
                  setCreateState({ status: "idle" });
                } catch (error) {
                  setCreateState({
                    status: "error",
                    message: describeApiError(error, "Bloom could not create this app."),
                  });
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
            <span>{countLabel(filteredScreens.length, "screen")}</span>
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
                            <span>{countLabel(screen.widgets.length, "widget")}</span>
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
                        setPlaygroundActionState({
                          status: "error",
                          message: describeApiError(error, "Bloom could not create this app."),
                        });
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

function ShareBadge({
  appCount,
  configId,
  onPublish,
  onTakeShipped,
  setState,
  state,
  status,
}: {
  /** Sharing writes the whole file, so a card whose file holds other apps says it shares them too. */
  appCount: number;
  configId: string;
  onPublish?: (configId: string) => Promise<{ path: string; alreadyPublished: boolean; warnings?: string[] }>;
  onTakeShipped?: (configId: string) => Promise<unknown>;
  setState: (state: ShareActionState) => void;
  state: ShareActionState;
  status: ShareStatus | undefined;
}) {
  const badge = status ? SHARE_BADGES[status] : undefined;
  if (!badge) {
    return null;
  }
  const busy = (state.status === "publishing" || state.status === "taking") && state.configId === configId;
  const run = async (kind: "publishing" | "taking", action: () => Promise<unknown>) => {
    setState({ configId, status: kind });
    try {
      const result = await action();
      setState(
        kind === "publishing" && result && typeof result === "object" && "path" in result
          ? {
              configId,
              status: "published",
              ...(result as { path: string; alreadyPublished: boolean; warnings?: string[] }),
            }
          : { status: "idle" },
      );
    } catch (error) {
      setState({ message: describeApiError(error, "Bloom could not share this app."), status: "error" });
    }
  };
  return (
    <p className="builder-app-card-share" data-share={status} title={badge.hint}>
      <span>{badge.label}</span>
      {badge.action === "publish" && onPublish ? (
        <button
          aria-label={`Share ${configId} with the team`}
          disabled={busy}
          onClick={() => run("publishing", () => onPublish(configId))}
          type="button"
        >
          {busy ? "Sharing…" : appCount > 1 ? `Share all ${appCount} apps` : "Share"}
        </button>
      ) : null}
      {badge.action === "take" && onTakeShipped ? (
        <button
          aria-label={`Update ${configId} to the shipped version`}
          disabled={busy}
          onClick={() => run("taking", () => onTakeShipped(configId))}
          type="button"
        >
          {busy ? "Updating…" : appCount > 1 ? `Update all ${appCount} apps` : "Update"}
        </button>
      ) : null}
    </p>
  );
}
