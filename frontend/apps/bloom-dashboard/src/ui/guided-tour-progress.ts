import { isRecord } from "@bloom/widgets";
import { useCallback, useState } from "react";

import { runtimePreferenceKey } from "../runtime/runtime-profile-overrides";

const STORAGE_KEY = "bloom.guided-tour-progress.v1";
const OFFER_STORAGE_KEY = "bloom.guided-tour-offer.v1";

type GuidedTourProgress = Record<string, string[]>;

export function guidedTourProgressKey(kind: "builder" | "runtime", configId: string, appId: string): string {
  return `${kind}:${runtimePreferenceKey({ appId, configId })}`;
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

function saveGuidedTourStep(tourKey: string, stepId: string): string[] {
  const progress = loadAllGuidedTourProgress();
  const completed = Array.from(new Set([...(progress[tourKey] ?? []), stepId]));
  progress[tourKey] = completed;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  return completed;
}

/** The first-entry offer shows until it is answered, on this device, for this app. */
export function isGuidedTourOfferDismissed(tourKey: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const dismissed = JSON.parse(window.localStorage.getItem(OFFER_STORAGE_KEY) ?? "[]");
    return Array.isArray(dismissed) && dismissed.includes(tourKey);
  } catch {
    return false;
  }
}

export function dismissGuidedTourOffer(tourKey: string): void {
  try {
    const dismissed = JSON.parse(window.localStorage.getItem(OFFER_STORAGE_KEY) ?? "[]");
    const next = Array.isArray(dismissed) ? Array.from(new Set([...dismissed, tourKey])) : [tourKey];
    window.localStorage.setItem(OFFER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A blocked store only means the offer shows again next time.
  }
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
