import { useCallback, useState } from "react";

const STORAGE_KEY = "bloom.guided-tour-progress.v1";

type GuidedTourProgress = Record<string, string[]>;

export function guidedTourProgressKey(kind: "builder" | "runtime", configId: string, appId: string): string {
  return `${kind}:${configId}:${appId}`;
}

export function loadGuidedTourProgress(tourKey: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return normalizeProgress(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"))[tourKey] ?? [];
  } catch {
    return [];
  }
}

export function saveGuidedTourStep(tourKey: string, stepId: string): string[] {
  const progress = loadAllGuidedTourProgress();
  const completed = Array.from(new Set([...(progress[tourKey] ?? []), stepId]));
  progress[tourKey] = completed;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  return completed;
}

export function useGuidedTourProgress(tourKey: string) {
  const [completedStepIds, setCompletedStepIds] = useState(() => loadGuidedTourProgress(tourKey));
  const completeStep = useCallback(
    (stepId: string) => {
      setCompletedStepIds(saveGuidedTourStep(tourKey, stepId));
    },
    [tourKey],
  );

  return { completedStepIds, completeStep };
}

function loadAllGuidedTourProgress(): GuidedTourProgress {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return normalizeProgress(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

function normalizeProgress(value: unknown): GuidedTourProgress {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, stepIds]) => {
      if (!key || !Array.isArray(stepIds)) {
        return [];
      }
      const normalized = Array.from(new Set(stepIds.filter((stepId): stepId is string => typeof stepId === "string")));
      return normalized.length > 0 ? [[key, normalized]] : [];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
