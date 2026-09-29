import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import {
  dismissGuidedTourOffer,
  guidedTourProgressKey,
  isGuidedTourOfferDismissed,
  loadGuidedTourProgress,
  useGuidedTourProgress,
} from "./guided-tour-progress";
import { restoreRuntimeSessionSelection, saveRuntimeSessionSelection } from "./runtime-session-selection";

const configurations: LoadedConfiguration[] = [
  {
    id: "lab",
    bundle: {
      metadata: {},
      applications: [
        {
          id: "ops",
          name: "Ops",
          profiles: [{ id: "switch", preferred_control_layout_id: "scan" }],
          screens: [{ id: "home" }, { id: "scan" }],
        },
      ],
    } as never,
  },
];

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("the runtime session selection", () => {
  it("reopens the screen this tab showed", () => {
    saveRuntimeSessionSelection({ configId: "lab", appId: "ops", screenId: "scan" });
    expect(restoreRuntimeSessionSelection(configurations, {})).toEqual({
      configId: "lab",
      appId: "ops",
      screenId: "scan",
    });
  });

  it("falls back to the profile's layout when the screen is gone, and to nothing when the app is", () => {
    saveRuntimeSessionSelection({ configId: "lab", appId: "ops", screenId: "removed" });
    expect(restoreRuntimeSessionSelection(configurations, { "lab:ops": "switch" })?.screenId).toBe("scan");
    expect(restoreRuntimeSessionSelection(configurations, {})?.screenId).toBe("home");
    saveRuntimeSessionSelection({ configId: "lab", appId: "retired", screenId: "home" });
    expect(restoreRuntimeSessionSelection(configurations, {})).toBeNull();
  });

  it("ignores a store that holds something else", () => {
    window.sessionStorage.setItem("bloom.runtime-session-selection.v1", "{not json");
    expect(restoreRuntimeSessionSelection(configurations, {})).toBeNull();
    window.sessionStorage.setItem("bloom.runtime-session-selection.v1", JSON.stringify({ configId: "lab" }));
    expect(restoreRuntimeSessionSelection(configurations, {})).toBeNull();
    window.sessionStorage.removeItem("bloom.runtime-session-selection.v1");
    expect(restoreRuntimeSessionSelection(configurations, {})).toBeNull();
  });
});

describe("guided tour progress", () => {
  const key = guidedTourProgressKey("runtime", "lab", "ops");

  it("keys a tour by kind and app", () => {
    expect(key).toBe("runtime:lab:ops");
    expect(guidedTourProgressKey("builder", "lab", "ops")).not.toBe(key);
  });

  it("remembers completed steps once each, per tour, across hooks", () => {
    const { result } = renderHook(() => useGuidedTourProgress(key));
    act(() => result.current.completeStep("stop"));
    act(() => result.current.completeStep("move"));
    act(() => result.current.completeStep("stop"));
    expect(result.current.completedStepIds).toEqual(["stop", "move"]);
    expect(loadGuidedTourProgress(key)).toEqual(["stop", "move"]);
    expect(loadGuidedTourProgress(guidedTourProgressKey("builder", "lab", "ops"))).toEqual([]);
    const { result: again } = renderHook(() => useGuidedTourProgress(key));
    expect(again.current.completedStepIds).toEqual(["stop", "move"]);
  });

  it("drops corrupt or foreign entries from the store rather than failing", () => {
    window.localStorage.setItem(
      "bloom.guided-tour-progress.v1",
      JSON.stringify({ [key]: ["stop", 3, "stop"], "": ["x"], other: "no", empty: [] }),
    );
    expect(loadGuidedTourProgress(key)).toEqual(["stop"]);
    window.localStorage.setItem("bloom.guided-tour-progress.v1", "[broken");
    expect(loadGuidedTourProgress(key)).toEqual([]);
    const { result } = renderHook(() => useGuidedTourProgress(key));
    act(() => result.current.completeStep("ready"));
    expect(result.current.completedStepIds).toEqual(["ready"]);
  });

  it("shows the first-entry offer until it is dismissed for that app", () => {
    expect(isGuidedTourOfferDismissed(key)).toBe(false);
    dismissGuidedTourOffer(key);
    dismissGuidedTourOffer(key);
    expect(isGuidedTourOfferDismissed(key)).toBe(true);
    expect(isGuidedTourOfferDismissed(guidedTourProgressKey("runtime", "lab", "other"))).toBe(false);
    window.localStorage.setItem("bloom.guided-tour-offer.v1", "{bad");
    expect(isGuidedTourOfferDismissed(key)).toBe(false);
    dismissGuidedTourOffer(key);
    expect(isGuidedTourOfferDismissed(key)).toBe(true);
  });
});
