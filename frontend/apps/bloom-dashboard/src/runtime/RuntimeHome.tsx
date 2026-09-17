import type { ApplicationConfig, RuntimeLanguage, UserProfile } from "@bloom/api-client";
import { useEffect, useState } from "react";

import type { LoadedConfiguration } from "../configurations/configuration-loader";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { runtimePreferenceKey } from "../ui/runtime-user-preferences";
import type { RuntimeProfileOverrides } from "./runtime-profile-overrides";
import { runtimeProfileOverrideKey } from "./runtime-profile-overrides";
import { resolveInitialScreen } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";

type RuntimeHomeProps = {
  configurations: readonly LoadedConfiguration[];
  onOpenBuilderHome?: () => void;
  onOpenHelp?: () => void;
  onOpenLanding?: () => void;
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  onOpenSupervisorApp: (selection: WorkspaceSelection) => void;
  onProfilePreferenceChange: (selection: Pick<WorkspaceSelection, "appId" | "configId">, profileId: string) => void;
  profileOverrides?: Record<string, RuntimeProfileOverrides>;
  profilePreferences: Record<string, string>;
  recentRuntimeSelections: readonly WorkspaceSelection[];
};

export type LibraryApp = {
  application: ApplicationConfig;
  archived: boolean;
  classes: { desktop: boolean; tablet: boolean };
  configuration: LoadedConfiguration;
  key: string;
  kind: "debug" | "operator" | "other" | "test";
};

const DESKTOP_PRESETS = new Set(["full-hd", "local-screen"]);
const TARGET_PX: Record<UserProfile["display_preset"], number> = {
  compact: 40,
  comfort: 56,
  default: 48,
  "high-visibility": 64,
};

/** One entry per app; a `<id>-desktop` sibling in the same configuration adds the desktop class (device-classes.md). */
export function collectLibraryApps(configurations: readonly LoadedConfiguration[]): LibraryApp[] {
  return configurations.flatMap((configuration) => {
    const applications = configuration.bundle.applications;
    const ids = new Set(applications.map((application) => application.id));
    return applications
      .filter((application) => !(application.id.endsWith("-desktop") && ids.has(application.id.slice(0, -8))))
      .map((application) => {
        const presets = application.screens.map((screen) => screen.canvas.preset_id);
        const sibling = applications.find((candidate) => candidate.id === `${application.id}-desktop`);
        return {
          application,
          archived: application.lifecycle === "archived",
          classes: {
            desktop: presets.some((preset) => DESKTOP_PRESETS.has(preset)) || sibling !== undefined,
            tablet: presets.some((preset) => !DESKTOP_PRESETS.has(preset)),
          },
          configuration,
          key: runtimePreferenceKey({ appId: application.id, configId: configuration.id }),
          kind: /debug/.test(application.id)
            ? "debug"
            : /test/.test(application.id)
              ? "test"
              : application.profiles.length > 0
                ? "operator"
                : "other",
        };
      });
  });
}

/** A stored preference counts only when it still names one of the app's profiles; `Auto` is no role at all. */
export function rememberedProfileId(application: ApplicationConfig, stored: string | undefined): string {
  return application.profiles.some((profile) => profile.id === stored) ? (stored as string) : "";
}

export function describeProfile(profile: UserProfile, strings: RuntimeStrings): string {
  const words = strings.library.tagline;
  const bench = profile.id === "bench" || profile.preferred_control_layout_id.endsWith("_bench");
  const scan = profile.motor_accessibility_preset === "scan";
  const parts = [
    scan ? words.scan : bench ? words.debugging : words.accessible,
    scan
      ? words.period(((profile.scan_period_ms ?? 1400) / 1000).toFixed(1))
      : words.target(TARGET_PX[profile.display_preset]),
    bench ? words.continuousLimits : profile.dwell_enabled || scan ? words.dwell : words.plainLanguage,
  ];
  return parts.join(" · ");
}

export function RuntimeHome({
  configurations,
  onOpenBuilderHome,
  onOpenHelp,
  onOpenLanding,
  onOpenRuntimeApp,
  onOpenSupervisorApp,
  onProfilePreferenceChange,
  profileOverrides = {},
  profilePreferences,
  recentRuntimeSelections,
}: RuntimeHomeProps) {
  const apps = collectLibraryApps(configurations);
  const recentKey = recentRuntimeSelections[0] ? runtimePreferenceKey(recentRuntimeSelections[0]) : "";
  // Resolved on every render: configurations load one by one, and the last app used may arrive after the first.
  const [selectedKey, setSelectedKey] = useState<string>();
  const [chosenRoles, setChosenRoles] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = apps.find((app) => app.key === selectedKey) ?? apps.find((app) => app.key === recentKey) ?? apps[0];
  const remembered = selected ? rememberedProfileId(selected.application, profilePreferences[selected.key]) : "";
  const chosen = selected ? (chosenRoles[selected.key] ?? remembered) : "";
  const chosenProfile = selected?.application.profiles.find((profile) => profile.id === chosen);
  const language = resolveLibraryLanguage(selected, chosenProfile, profileOverrides);
  const strings = useRuntimeStrings(language);
  const words = strings.library;
  const viewport =
    typeof window === "undefined"
      ? { height: 720, width: 1280 }
      : { height: window.innerHeight, width: window.innerWidth };

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  const needsRole = Boolean(selected && selected.application.profiles.length > 0 && !chosenProfile);

  const open = () => {
    if (!selected || needsRole) {
      return;
    }
    const { application, configuration } = selected;
    const identity = { appId: application.id, configId: configuration.id };
    if (chosenProfile) {
      onProfilePreferenceChange(identity, chosenProfile.id);
    }
    const screen = chosenProfile ? resolveInitialScreen(application, chosenProfile.id) : application.screens[0];
    if (screen) {
      onOpenRuntimeApp({ ...identity, screenId: screen.id });
    }
  };

  return (
    <section aria-labelledby="runtime-library-title" className="runtime-library">
      <header className="runtime-kiosk-bar">
        <span className="runtime-kiosk-app">{words.brand}</span>
        <h1 className="runtime-kiosk-screen" id="runtime-library-title">
          {words.title}
        </h1>
        <span className="runtime-kiosk-status" data-tone="ready">
          <span aria-hidden="true" className="runtime-kiosk-status-dot" />
          {strings.status.ready}
        </span>
        <span className="runtime-kiosk-frame">
          {(viewport.width >= 1600 ? words.classes.desktop : words.classes.tablet).toLowerCase()} · {viewport.width}×
          {viewport.height}
        </span>
        <span className="runtime-kiosk-spacer" />
        <div className="runtime-library-menu">
          <button
            aria-expanded={menuOpen}
            aria-label={words.menu}
            className="runtime-kiosk-maintenance"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className="runtime-kiosk-dots">
              ⋯
            </span>
          </button>
          {menuOpen ? (
            <div className="runtime-library-menu-list">
              {onOpenLanding ? (
                <button onClick={onOpenLanding} type="button">
                  {strings.kiosk.home}
                </button>
              ) : null}
              {onOpenBuilderHome ? (
                <button onClick={onOpenBuilderHome} type="button">
                  {words.builder}
                </button>
              ) : null}
              {onOpenHelp ? (
                <button onClick={onOpenHelp} type="button">
                  {strings.kiosk.help}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="runtime-library-body">
        <div className="runtime-library-apps">
          <h2 className="runtime-settings-group">{words.appsLabel}</h2>
          {apps.length === 0 ? <p className="runtime-library-empty">{words.empty}</p> : null}
          <ul aria-label={words.appsLabel} className="runtime-library-list">
            {apps.map((app) => (
              <li key={app.key}>
                <button
                  aria-label={app.application.name}
                  aria-pressed={app.key === selected?.key}
                  className="runtime-library-row"
                  data-kind={app.kind}
                  onClick={() => setSelectedKey(app.key)}
                  type="button"
                >
                  <span aria-hidden="true" className="runtime-library-stripe" />
                  <span className="runtime-library-row-text">
                    <strong>{app.application.name}</strong>
                    <span>
                      {words.screens(app.application.screens.length)} · {classSummary(app, strings)}
                    </span>
                  </span>
                  <span className="runtime-library-badges">
                    {app.archived ? (
                      <span className="runtime-library-badge" data-state="archived">
                        {words.archived}
                      </span>
                    ) : null}
                    <span className="runtime-library-badge" data-state={app.classes.tablet ? "yes" : "no"}>
                      {words.classes.tablet}
                    </span>
                    <span className="runtime-library-badge" data-state={app.classes.desktop ? "yes" : "no"}>
                      {words.classes.desktop}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected ? (
          <aside aria-label={words.openAsLabel} className="runtime-library-rail">
            <h2 className="runtime-settings-group">{words.openAsLabel}</h2>
            <div className="runtime-settings-card runtime-library-detail">
              <h3>{selected.application.name}</h3>
              {selected.application.description ? <p>{selected.application.description}</p> : null}
              <span className="runtime-library-meta">
                {words.screens(selected.application.screens.length)} ·{" "}
                {selected.archived ? words.archived.toLowerCase() : words.active}
              </span>
              {selected.application.profiles.length > 0 ? (
                <>
                  <p className="runtime-library-note">{words.roleNote}</p>
                  <div className="runtime-library-roles">
                    {selected.application.profiles.map((profile) => (
                      <button
                        aria-label={profile.name}
                        aria-pressed={profile.id === chosen}
                        key={profile.id}
                        onClick={() => setChosenRoles((current) => ({ ...current, [selected.key]: profile.id }))}
                        type="button"
                      >
                        <span className="runtime-library-role-text">
                          <strong>{profile.name}</strong>
                          <span>{describeProfile(profile, strings)}</span>
                        </span>
                        {profile.id === remembered ? (
                          <span className="runtime-library-last">{words.lastUsed}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="runtime-library-note">{words.noProfiles}</p>
              )}
            </div>
            <button className="runtime-library-open" disabled={needsRole} onClick={open} type="button">
              {needsRole ? words.chooseRole : chosenProfile ? words.openAs(chosenProfile.name) : words.open}
            </button>
            <button
              aria-label={words.supervisorAria(selected.application.name)}
              className="runtime-library-supervisor"
              disabled={selected.application.screens.length === 0}
              onClick={() => {
                const screen = selected.application.screens[0];
                if (screen) {
                  onOpenSupervisorApp({
                    appId: selected.application.id,
                    configId: selected.configuration.id,
                    screenId: screen.id,
                  });
                }
              }}
              type="button"
            >
              {strings.kiosk.supervisorMirror}
            </button>
            <div className="runtime-settings-card runtime-library-device">
              <h4>{words.thisDevice}</h4>
              <p>
                {viewport.width >= 1600
                  ? words.deviceDesktop(viewport.width, viewport.height)
                  : words.deviceTablet(viewport.width, viewport.height)}
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function classSummary(app: LibraryApp, strings: RuntimeStrings): string {
  const classes = strings.library.classes;
  if (app.classes.tablet && app.classes.desktop) {
    return classes.both;
  }
  return app.classes.desktop ? classes.desktopOnly : classes.tabletOnly;
}

function resolveLibraryLanguage(
  app: LibraryApp | undefined,
  profile: UserProfile | undefined,
  overrides: Record<string, RuntimeProfileOverrides>,
): RuntimeLanguage {
  if (!app || !profile) {
    return "en";
  }
  const identity = { appId: app.application.id, configId: app.configuration.id };
  return overrides[runtimeProfileOverrideKey(identity, profile.id)]?.language ?? profile.language ?? "en";
}
