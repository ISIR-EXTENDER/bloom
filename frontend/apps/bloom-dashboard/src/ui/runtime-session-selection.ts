import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { resolveInitialScreen } from "../runtime/runtimeProfile";
import type { WorkspaceSelection } from "./ConfigurationWorkspace";
import { runtimePreferenceKey } from "./runtime-user-preferences";

/** Per tab, so reloading #/runtime/app reopens the app it showed instead of the first one. */
const STORAGE_KEY = "bloom.runtime-session-selection.v1";

export function saveRuntimeSessionSelection(selection: WorkspaceSelection): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Without storage a reload falls back to the first app.
  }
}

export function restoreRuntimeSessionSelection(
  configurations: readonly LoadedConfiguration[],
  profilePreferences: Readonly<Record<string, string>>,
): WorkspaceSelection | null {
  let stored: unknown;
  try {
    stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
  if (!isSelection(stored)) {
    return null;
  }
  const application = configurations
    .find((configuration) => configuration.id === stored.configId)
    ?.bundle.applications.find((candidate) => candidate.id === stored.appId);
  if (!application) {
    return null;
  }
  const screen =
    application.screens.find((candidate) => candidate.id === stored.screenId) ??
    resolveInitialScreen(application, profilePreferences[runtimePreferenceKey(stored)] ?? "");
  return screen ? { appId: application.id, configId: stored.configId, screenId: screen.id } : null;
}

function isSelection(value: unknown): value is WorkspaceSelection {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.appId === "string" &&
    typeof candidate.configId === "string" &&
    typeof candidate.screenId === "string"
  );
}
