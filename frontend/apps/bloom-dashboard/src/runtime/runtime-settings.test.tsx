/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadRuntimeUserPreferences,
  type RuntimeUserPreferences,
  saveRuntimeUserPreferences,
  setRuntimeProfileOverrides,
} from "../ui/runtime-user-preferences";
import { RuntimeSettingsPanel } from "./RuntimeSettingsPanel";
import type { RuntimeProfileOverrides } from "./runtime-profile-overrides";
import type { ResolvedRuntimeProfile } from "./runtimeProfile";
import { SCAN_TARGET_SELECTOR } from "./use-switch-scanning";

const defaultProfile: ResolvedRuntimeProfile = {
  audioCues: false,
  deadzone: 0.1,
  displayPreset: "comfort",
  dwellEnabled: false,
  dwellMs: 800,
  fontScale: 1,
  id: "operator",
  motorAccessibilityPreset: "default",
  name: "Camille",
  repeatGuardMs: 0,
  scanPeriodMs: 1400,
};

const EMPTY_PREFERENCES: RuntimeUserPreferences = {
  profileOverrides: {},
  profilePreferences: {},
  recentRuntimeSelections: [],
};

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderSettings(
  overrides: RuntimeProfileOverrides = {},
  onChange = vi.fn<(next: RuntimeProfileOverrides) => void>(),
) {
  const result = render(
    <RuntimeSettingsPanel
      allowedCommandFrameIds={["base_link", "effector_frame", "hybrid_frame"]}
      baseCommandFrameId="base_link"
      baseProfile={defaultProfile}
      onChange={onChange}
      onDone={vi.fn()}
      overrides={overrides}
      teleopActive={false}
    />,
  );
  return { ...result, onChange };
}

describe("runtime settings", () => {
  it("uses a changed scan period in the real scanning interval", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    renderSettings({ motorAccessibilityPreset: "scan" });

    fireEvent.click(screen.getByRole("button", { name: "Fine tuning" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Scan speed" }));

    expect(screen.getByLabelText("Scan speed value").textContent).toBe("1.6 s");
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1600);
  });

  it("puts every enabled settings button in the scan target set", () => {
    vi.useFakeTimers();
    const { container } = renderSettings({ motorAccessibilityPreset: "scan" });
    const settings = within(container).getByRole("region", { name: "Settings" });
    const expectedTargets = [...settings.querySelectorAll<HTMLElement>(SCAN_TARGET_SELECTOR)].filter(
      (target) => target.offsetParent !== null,
    );
    const visited = new Set<HTMLElement>();

    for (let index = 0; index < expectedTargets.length; index += 1) {
      const activeTarget = settings.querySelector<HTMLElement>("[data-scan-lit]");
      if (activeTarget) {
        visited.add(activeTarget);
      }
      act(() => vi.advanceTimersByTime(1400));
    }

    expect(visited.size).toBe(expectedTargets.length);
    expect(screen.getByText(new RegExp(`Scanning .+ of ${expectedTargets.length}`))).toBeTruthy();
  });

  it("restores the opening overrides with Undo changes", () => {
    const { onChange } = renderSettings({ deadzone: 0.15 });

    fireEvent.click(screen.getByRole("button", { name: "Fine tuning" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Ignore small movements" }));
    expect(screen.getByRole("button", { name: "Undo changes" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));

    expect(onChange).toHaveBeenLastCalledWith({ deadzone: 0.15 });
    expect(screen.queryByRole("button", { name: "Undo changes" })).toBeNull();
  });

  it("keeps the try strip local and outside the persisted settings path", () => {
    vi.useFakeTimers();
    const { onChange } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Left" }));

    expect(screen.getByLabelText("Try current settings value").textContent).toContain("x -1.00");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("persists profile overrides in the existing preference payload", () => {
    const updated = setRuntimeProfileOverrides(
      EMPTY_PREFERENCES,
      { configId: "explorer-manager", appId: "explorer-manager" },
      "operator",
      { deadzone: 0.2, motorAccessibilityPreset: "step", scanPeriodMs: 1800 },
    );

    saveRuntimeUserPreferences(updated);

    expect(loadRuntimeUserPreferences().profileOverrides["explorer-manager:explorer-manager:operator"]).toEqual({
      deadzone: 0.2,
      motorAccessibilityPreset: "step",
      scanPeriodMs: 1800,
    });
  });

  it("ignores corrupted and invalid stored overrides", () => {
    window.localStorage.setItem("bloom.runtime-user-preferences.v1", "{not-json");
    expect(loadRuntimeUserPreferences()).toEqual(EMPTY_PREFERENCES);

    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "config:app:profile": {
            commandFrameId: "  base_link  ",
            deadzone: "large",
            motorAccessibilityPreset: "unsupported",
            scanPeriodMs: Number.POSITIVE_INFINITY,
          },
        },
      }),
    );

    expect(loadRuntimeUserPreferences().profileOverrides["config:app:profile"]).toEqual({
      commandFrameId: "base_link",
    });
  });
});
