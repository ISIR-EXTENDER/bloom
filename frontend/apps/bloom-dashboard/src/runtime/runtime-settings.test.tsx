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
  language: "en",
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

function renderSettings(overrides: RuntimeProfileOverrides = {}) {
  const onSave = vi.fn<(next: RuntimeProfileOverrides) => void>();
  const onClose = vi.fn();
  const result = render(
    <RuntimeSettingsPanel
      applicationName="Explorer Manager"
      baseProfile={defaultProfile}
      onClose={onClose}
      onSave={onSave}
      overrides={overrides}
      runtimeRole="operator"
    />,
  );
  return { ...result, onClose, onSave };
}

describe("runtime settings", () => {
  it("uses a changed scan period in the real scanning interval", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    renderSettings({ motorAccessibilityPreset: "scan" });

    fireEvent.click(screen.getByRole("button", { name: "Increase Scan step" }));

    expect(screen.getByLabelText("Scan step value").textContent).toBe("1600 ms");
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

  it("dims the timing that does not apply to the chosen input method instead of accepting input", () => {
    renderSettings();

    expect(screen.getByText("Timing — touch needs no timing")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Increase Hold to activate" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("only for Dwell")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Increase Joystick dead zone" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dwell" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Hold to activate" }));

    expect(screen.getByLabelText("Hold to activate value").textContent).toBe("900 ms");
  });

  it("keeps how a push moves apart from how the controls are reached", () => {
    const { onSave } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Tap by tap" }));
    fireEvent.click(screen.getByRole("button", { name: "Dwell" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));

    expect(onSave).toHaveBeenCalledWith({ dwellEnabled: true, motorAccessibilityPreset: "step" });
  });

  it("interlocks the push choice while scanning", () => {
    renderSettings({ motorAccessibilityPreset: "scan" });

    expect(screen.getByText("only for Touch and Dwell")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("changes the text size and language live, and saves only on Save and resume", () => {
    const { onClose, onSave } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Larger" }));
    fireEvent.click(screen.getByRole("button", { name: "FR" }));

    expect(screen.getByRole("region", { name: "Réglages" }).getAttribute("style")).toContain(
      "--runtime-font-scale: 1.3",
    );
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et reprendre" }));
    expect(onSave).toHaveBeenCalledWith({ fontScale: 1.3, language: "fr" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves without saving on Escape", () => {
    const { onClose, onSave } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Large" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("tries a press locally, honouring the repeat guard, and sends nothing", () => {
    vi.useFakeTimers();
    const { onSave } = renderSettings({ repeatGuardMs: 300 });
    const target = screen.getByRole("button", { name: "Try a press" });

    fireEvent.click(target);
    fireEvent.click(target);
    expect(screen.getByText("Pressed 1 time. Nothing was sent.")).toBeTruthy();

    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(target);
    expect(screen.getByText("Pressed 2 times. Nothing was sent.")).toBeTruthy();
    expect(screen.getByText("target 56 px · font 1.00 · immediate")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("offers no command frame: a setting an operator reaches must not change what the app sends", () => {
    renderSettings();

    expect(screen.queryByText(/base_link|frame/i)).toBeNull();
  });

  it("persists profile overrides in the existing preference payload", () => {
    const updated = setRuntimeProfileOverrides(
      EMPTY_PREFERENCES,
      { configId: "explorer-manager", appId: "explorer-manager" },
      "operator",
      { deadzone: 0.2, language: "es", motorAccessibilityPreset: "step", scanPeriodMs: 1800 },
    );

    saveRuntimeUserPreferences(updated);

    expect(loadRuntimeUserPreferences().profileOverrides["explorer-manager:explorer-manager:operator"]).toEqual({
      deadzone: 0.2,
      language: "es",
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
            language: "de",
            motorAccessibilityPreset: "unsupported",
            scanPeriodMs: Number.POSITIVE_INFINITY,
          },
        },
      }),
    );

    // A stored command frame is dropped: the frame is chosen on the Joystick Lab, never per profile.
    expect(loadRuntimeUserPreferences().profileOverrides["config:app:profile"]).toBeUndefined();
  });
});
