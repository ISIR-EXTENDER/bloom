import {
  normalizeRuntimeProfileOverrides,
  type RuntimeProfileOverrides,
  runtimePreferenceKey,
  runtimeProfileOverrideKey,
} from "../runtime/runtime-profile-overrides";
import type { WorkspaceSelection } from "./ConfigurationWorkspace";

export type RuntimeUserPreferences = {
  profileOverrides: Record<string, RuntimeProfileOverrides>;
  profilePreferences: Record<string, string>;
  recentRuntimeSelections: WorkspaceSelection[];
};

const STORAGE_KEY = "bloom.runtime-user-preferences.v1";
const MAX_RECENT_RUNTIME_SELECTIONS = 3;

const EMPTY_RUNTIME_USER_PREFERENCES: RuntimeUserPreferences = {
  profileOverrides: {},
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

export function setRuntimeProfileOverrides(
  preferences: RuntimeUserPreferences,
  selection: Pick<WorkspaceSelection, "appId" | "configId">,
  profileId: string,
  value: RuntimeProfileOverrides,
): RuntimeUserPreferences {
  const profileOverrides = { ...preferences.profileOverrides };
  const key = runtimeProfileOverrideKey(selection, profileId);
  const overrides = normalizeRuntimeProfileOverrides(value);
  if (Object.keys(overrides).length > 0) {
    profileOverrides[key] = overrides;
  } else {
    delete profileOverrides[key];
  }
  return { ...preferences, profileOverrides };
}

export { runtimePreferenceKey };

function normalizeRuntimeUserPreferences(value: unknown): RuntimeUserPreferences {
  if (!isRecord(value)) {
    return EMPTY_RUNTIME_USER_PREFERENCES;
  }

  return {
    profileOverrides: normalizeProfileOverrides(value.profileOverrides),
    profilePreferences: normalizeProfilePreferences(value.profilePreferences),
    recentRuntimeSelections: normalizeRecentRuntimeSelections(value.recentRuntimeSelections),
  };
}

function normalizeProfileOverrides(value: unknown): Record<string, RuntimeProfileOverrides> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, candidate]) => {
      const overrides = normalizeRuntimeProfileOverrides(candidate);
      return key && Object.keys(overrides).length > 0 ? [[key, overrides]] : [];
    }),
  );
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
