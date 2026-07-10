import type { WorkspaceSelection } from "./ConfigurationWorkspace";

export type RuntimeUserPreferences = {
  profilePreferences: Record<string, string>;
  recentRuntimeSelections: WorkspaceSelection[];
};

const STORAGE_KEY = "bloom.runtime-user-preferences.v1";
const MAX_RECENT_RUNTIME_SELECTIONS = 3;

const EMPTY_RUNTIME_USER_PREFERENCES: RuntimeUserPreferences = {
  profilePreferences: {},
  recentRuntimeSelections: [],
};

export function loadRuntimeUserPreferences(): RuntimeUserPreferences {
  if (typeof window === "undefined") {
    return EMPTY_RUNTIME_USER_PREFERENCES;
  }

  try {
    return normalizeRuntimeUserPreferences(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return EMPTY_RUNTIME_USER_PREFERENCES;
  }
}

export function saveRuntimeUserPreferences(preferences: RuntimeUserPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeRuntimeUserPreferences(preferences)));
}

export function addRecentRuntimeSelection(
  preferences: RuntimeUserPreferences,
  selection: WorkspaceSelection,
): RuntimeUserPreferences {
  return {
    ...preferences,
    recentRuntimeSelections: [
      selection,
      ...preferences.recentRuntimeSelections.filter(
        (candidate) => candidate.configId !== selection.configId || candidate.appId !== selection.appId,
      ),
    ].slice(0, MAX_RECENT_RUNTIME_SELECTIONS),
  };
}

export function setRuntimeProfilePreference(
  preferences: RuntimeUserPreferences,
  selection: Pick<WorkspaceSelection, "appId" | "configId">,
  profileId: string,
): RuntimeUserPreferences {
  const profilePreferences = { ...preferences.profilePreferences };
  const key = runtimePreferenceKey(selection);
  if (profileId) {
    profilePreferences[key] = profileId;
  } else {
    delete profilePreferences[key];
  }
  return { ...preferences, profilePreferences };
}

export function getRuntimeProfilePreference(
  preferences: RuntimeUserPreferences,
  selection: Pick<WorkspaceSelection, "appId" | "configId">,
): string {
  return preferences.profilePreferences[runtimePreferenceKey(selection)] ?? "";
}

function runtimePreferenceKey(selection: Pick<WorkspaceSelection, "appId" | "configId">): string {
  return `${selection.configId}:${selection.appId}`;
}

function normalizeRuntimeUserPreferences(value: unknown): RuntimeUserPreferences {
  if (!isRecord(value)) {
    return EMPTY_RUNTIME_USER_PREFERENCES;
  }

  return {
    profilePreferences: normalizeProfilePreferences(value.profilePreferences),
    recentRuntimeSelections: normalizeRecentRuntimeSelections(value.recentRuntimeSelections),
  };
}

function normalizeProfilePreferences(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === "string",
    ),
  );
}

function normalizeRecentRuntimeSelections(value: unknown): WorkspaceSelection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isWorkspaceSelection).slice(0, MAX_RECENT_RUNTIME_SELECTIONS);
}

function isWorkspaceSelection(value: unknown): value is WorkspaceSelection {
  return (
    isRecord(value) &&
    typeof value.appId === "string" &&
    value.appId.length > 0 &&
    typeof value.configId === "string" &&
    value.configId.length > 0 &&
    typeof value.screenId === "string" &&
    value.screenId.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
