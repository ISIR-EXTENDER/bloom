import type { ApplicationConfig } from "@bloom/api-client";
import { BloomButton, BloomCard, BloomTag } from "@bloom/ui";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";

type RuntimeHomeProps = {
  configurations: readonly LoadedConfiguration[];
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  onProfilePreferenceChange: (selection: Pick<WorkspaceSelection, "appId" | "configId">, profileId: string) => void;
  profilePreferences: Record<string, string>;
  recentRuntimeSelections: readonly WorkspaceSelection[];
};

export function RuntimeHome({
  configurations,
  onOpenRuntimeApp,
  onProfilePreferenceChange,
  profilePreferences,
  recentRuntimeSelections,
}: RuntimeHomeProps) {
  const runtimeApps = collectRuntimeApps(configurations);
  const recentRuntimeApps = collectRecentRuntimeApps(configurations, recentRuntimeSelections);

  return (
    <section className="runtime-home" aria-labelledby="runtime-home-title">
      <div className="runtime-home-hero">
        <div>
          <p className="eyebrow">Runtime library</p>
          <h1 id="runtime-home-title">Choose an app to operate.</h1>
        </div>
        <p>
          Runtime is the clean operator view. Pick an app here, then use the small edit shortcuts only when something
          needs to go back through the builder.
        </p>
      </div>

      {recentRuntimeApps.length > 0 ? (
        <section className="runtime-recent-panel" aria-labelledby="runtime-recent-title">
          <div>
            <p className="eyebrow">Recently opened</p>
            <h2 id="runtime-recent-title">Resume quickly</h2>
          </div>
          <div className="runtime-recent-actions">
            {recentRuntimeApps.map(({ application, configuration, screen }) => (
              <button
                aria-label={`Resume ${application.name} on ${screen.title}`}
                className="runtime-recent-action"
                key={`${configuration.id}:${application.id}`}
                onClick={() =>
                  onOpenRuntimeApp({ appId: application.id, configId: configuration.id, screenId: screen.id })
                }
                type="button"
              >
                <strong>{application.name}</strong>
                <span>{screen.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ul className="runtime-app-grid" aria-label="Available runtime apps">
        {runtimeApps.map(({ application, configuration, firstScreen }) => (
          <li key={`${configuration.id}:${application.id}`}>
            <BloomCard className="runtime-app-card" tone="default">
              <div>
                <BloomTag tone="primary">{application.screens.length} screens</BloomTag>
                <h2>{application.name}</h2>
                {application.description ? <p>{application.description}</p> : <p>Ready to launch in operator mode.</p>}
              </div>
              {application.profiles.length > 0 ? (
                <label className="runtime-profile-select">
                  <span>Display profile</span>
                  <select
                    aria-label={`${application.name} display profile`}
                    onChange={(event) =>
                      onProfilePreferenceChange(
                        { appId: application.id, configId: configuration.id },
                        event.target.value,
                      )
                    }
                    value={profilePreferences[createRuntimePreferenceKey(configuration.id, application.id)] ?? ""}
                  >
                    <option value="">Auto</option>
                    {application.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <BloomButton
                ariaLabel={`Launch ${application.name} runtime`}
                className="runtime-app-card-action"
                disabled={!firstScreen}
                onClick={() => {
                  if (!firstScreen) {
                    return;
                  }
                  onOpenRuntimeApp({ appId: application.id, configId: configuration.id, screenId: firstScreen.id });
                }}
                tone="primary"
              >
                Launch runtime
              </BloomButton>
            </BloomCard>
          </li>
        ))}
      </ul>
    </section>
  );
}

function createRuntimePreferenceKey(configId: string, appId: string): string {
  return `${configId}:${appId}`;
}

export function collectRuntimeApps(configurations: readonly LoadedConfiguration[]) {
  return configurations.flatMap((configuration) =>
    configuration.bundle.applications.map((application) => ({
      application,
      configuration,
      firstScreen: application.screens[0],
    })),
  );
}

export function collectRecentRuntimeApps(
  configurations: readonly LoadedConfiguration[],
  recentRuntimeSelections: readonly WorkspaceSelection[],
) {
  return recentRuntimeSelections
    .map((recentSelection) => {
      const configuration = configurations.find((candidate) => candidate.id === recentSelection.configId);
      const application = configuration?.bundle.applications.find(
        (candidate: ApplicationConfig) => candidate.id === recentSelection.appId,
      );
      const screen =
        application?.screens.find((candidate) => candidate.id === recentSelection.screenId) ?? application?.screens[0];

      return configuration && application && screen ? { application, configuration, screen } : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
}
