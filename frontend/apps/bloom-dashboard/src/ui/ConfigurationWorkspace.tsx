import type { ApplicationConfig, ConfigurationBundle, ScreenConfig } from "@bloom/api-client";

import type { LoadedConfiguration } from "../configurations/configuration-loader";

export type WorkspaceSelection = {
  appId: string;
  configId: string;
  screenId: string;
};

type ConfigurationWorkspaceProps = {
  configurations: readonly LoadedConfiguration[];
  selection: WorkspaceSelection;
  onSelectionChange: (selection: WorkspaceSelection) => void;
};

export type SelectedWorkspace = {
  application: ApplicationConfig;
  bundle: ConfigurationBundle;
  configuration: LoadedConfiguration;
  screen: ScreenConfig;
};

export function ConfigurationWorkspace({ configurations, onSelectionChange, selection }: ConfigurationWorkspaceProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);

  return (
    <aside className="workspace-panel" aria-labelledby="workspace-title">
      <div>
        <p className="eyebrow">Main app</p>
        <h2 id="workspace-title">Choose what to preview</h2>
      </div>

      <label className="workspace-field">
        <span>Configuration</span>
        <select
          onChange={(event) => {
            const configuration = configurations.find((item) => item.id === event.target.value) ?? configurations[0];
            const application = configuration?.bundle.applications[0];
            const screen = application?.screens[0];
            if (configuration && application && screen) {
              onSelectionChange({ configId: configuration.id, appId: application.id, screenId: screen.id });
            }
          }}
          value={selectedWorkspace.configuration.id}
        >
          {configurations.map((configuration) => (
            <option key={configuration.id} value={configuration.id}>
              {configuration.bundle.applications[0]?.name ?? configuration.id}
            </option>
          ))}
        </select>
      </label>

      <label className="workspace-field">
        <span>Application</span>
        <select
          onChange={(event) => {
            const application =
              selectedWorkspace.bundle.applications.find((item) => item.id === event.target.value) ??
              selectedWorkspace.application;
            const screen = application.screens[0] ?? selectedWorkspace.screen;
            onSelectionChange({
              configId: selectedWorkspace.configuration.id,
              appId: application.id,
              screenId: screen.id,
            });
          }}
          value={selectedWorkspace.application.id}
        >
          {selectedWorkspace.bundle.applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.name}
            </option>
          ))}
        </select>
      </label>

      {selectedWorkspace.application.description ? (
        <p className="workspace-description">{selectedWorkspace.application.description}</p>
      ) : null}

      <ul className="screen-list" aria-label="Available screens">
        {selectedWorkspace.application.screens.map((screen) => (
          <li key={screen.id}>
            <button
              aria-current={selectedWorkspace.screen.id === screen.id ? "true" : undefined}
              className="screen-list-item"
              onClick={() =>
                onSelectionChange({
                  configId: selectedWorkspace.configuration.id,
                  appId: selectedWorkspace.application.id,
                  screenId: screen.id,
                })
              }
              type="button"
            >
              <strong>{screen.title}</strong>
              <span>
                {screen.widgets.length} widgets · {screen.canvas.preset_id}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function resolveSelectedWorkspace(
  configurations: readonly LoadedConfiguration[],
  selection: WorkspaceSelection,
): SelectedWorkspace {
  const configuration = configurations.find((item) => item.id === selection.configId) ?? configurations[0];
  if (!configuration) {
    throw new Error("Cannot resolve a workspace without configurations.");
  }

  const application =
    configuration.bundle.applications.find((item) => item.id === selection.appId) ??
    configuration.bundle.applications[0];
  if (!application) {
    throw new Error(`Configuration "${configuration.id}" does not contain any applications.`);
  }

  const screen = application.screens.find((item) => item.id === selection.screenId) ?? application.screens[0];
  if (!screen) {
    throw new Error(`Application "${application.id}" does not contain any screens.`);
  }

  return {
    application,
    bundle: configuration.bundle,
    configuration,
    screen,
  };
}

export function getInitialWorkspaceSelection(
  configurations: readonly LoadedConfiguration[],
): WorkspaceSelection | null {
  const configuration = configurations[0];
  const application = configuration?.bundle.applications[0];
  const screen = application?.screens[0];
  if (!configuration || !application || !screen) {
    return null;
  }
  return { configId: configuration.id, appId: application.id, screenId: screen.id };
}
