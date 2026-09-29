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
  motionCue: false,
  name: "Camille",
  repeatGuardMs: 0,
  scanPeriodMs: 1400,
  practiceOffer: "start",
  themePresetId: null,
};

const EMPTY_PREFERENCES: RuntimeUserPreferences = {
  profileOverrides: {},
  profilePreferences: {},
  recentRuntimeSelections: [],
};

beforeEach(() => {
  window.localStorage.clear();
  HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
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
  // 48 px is the floor for everyone; scan, dwell and high visibility get 64.
  it.each([
    [{ motorAccessibilityPreset: "scan" } as RuntimeProfileOverrides, "true"],
    [{ dwellEnabled: true } as RuntimeProfileOverrides, "true"],
    [{} as RuntimeProfileOverrides, "false"],
  ])("raises its controls to the profile target for %o", (overrides, expected) => {
    const { container } = renderSettings(overrides);

    expect(within(container).getByRole("region", { name: "Settings" })).toHaveAttribute("data-assistive", expected);
  });

  it("keeps motion warnings off until the role turns them on, and saves the choice", () => {
    const { onSave } = renderSettings();
    const toggle = screen.getByRole("switch", { name: "Motion warnings" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ motionCue: true }));
  });

  it("keeps the stored setting keys out of what a screen reader reads", () => {
    // font_scale, dwell_ms and deadzone are for whoever edits the profile.
    const { container } = renderSettings();

    const keys = [...container.querySelectorAll<HTMLElement>("span.runtime-settings-key")];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("raises them for a high-visibility display too", () => {
    const { container } = render(
      <RuntimeSettingsPanel
        applicationName="Explorer Manager"
        baseProfile={{ ...defaultProfile, displayPreset: "high-visibility" }}
        onClose={() => undefined}
        onSave={() => undefined}
        overrides={{}}
        runtimeRole="operator"
      />,
    );

    expect(within(container).getByRole("region", { name: "Settings" })).toHaveAttribute("data-assistive", "true");
  });

  it("uses a changed scan period in the real scanning interval", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    renderSettings({ motorAccessibilityPreset: "scan" });

    fireEvent.click(screen.getByRole("button", { name: "Increase Scan step" }));

    expect(screen.getByLabelText("Scan step value").textContent).toBe("1600 ms");
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 1600);
  });

  // Touch and Dwell are the exception: under a saved scan a caregiver changes them by touch.
  it("puts every enabled settings button but the touch-only ones in the scan target set", () => {
    vi.useFakeTimers();
    const { container } = renderSettings({ motorAccessibilityPreset: "scan" });
    const settings = within(container).getByRole("region", { name: "Settings" });
    const expectedTargets = [...settings.querySelectorAll<HTMLElement>(SCAN_TARGET_SELECTOR)].filter(
      (target) => target.getClientRects().length > 0 && !target.hasAttribute("data-scan-touch-only"),
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
    expect([...visited].map((target) => target.textContent)).not.toContain("Touch");
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

  // Tapping the input method or push mode already chosen rewrote the preset to "default" and dropped large targets.
  it("keeps a profile's own reach preset through choices that do not replace it", () => {
    const onSave = vi.fn<(next: RuntimeProfileOverrides) => void>();
    render(
      <RuntimeSettingsPanel
        applicationName="Explorer Manager"
        baseProfile={{ ...defaultProfile, motorAccessibilityPreset: "large-targets" }}
        onClose={vi.fn()}
        onSave={onSave}
        overrides={{}}
        runtimeRole="operator"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Touch" }));
    fireEvent.click(screen.getByRole("button", { name: "Drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Dwell" }));
    fireEvent.click(screen.getByRole("button", { name: "Tap by tap" }));
    fireEvent.click(screen.getByRole("button", { name: "Drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Touch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));

    expect(onSave).toHaveBeenCalledWith({ dwellEnabled: false, motorAccessibilityPreset: "large-targets" });
  });

  it("saves nothing about reach when only the selected choices were tapped", () => {
    const { onSave } = renderSettings({ motorAccessibilityPreset: "assisted-touch" });

    fireEvent.click(screen.getByRole("button", { name: "Touch" }));
    fireEvent.click(screen.getByRole("button", { name: "Drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));

    expect(onSave).toHaveBeenCalledWith({ motorAccessibilityPreset: "assisted-touch" });
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

  it("leaves without saving on Discard changes, the exit a touchscreen can reach", () => {
    const { onClose, onSave } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Larger" }));
    fireEvent.click(screen.getByRole("button", { name: "ES" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("tries a press locally, honouring the repeat guard, and sends nothing", () => {
    vi.useFakeTimers();
    const { onSave } = renderSettings({ repeatGuardMs: 300 });
    const target = screen.getByRole("button", { name: "Try a press" });
    expect(screen.getByRole("heading", { name: "Try it — nothing is sent" })).toBeTruthy();

    fireEvent.click(target);
    fireEvent.click(target);
    expect(screen.getByText("Pressed 1 time. Nothing was sent.")).toBeTruthy();

    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(target);
    expect(screen.getByText("Pressed 2 times. Nothing was sent.")).toBeTruthy();
    expect(screen.getByText("target 56 px · font 1.00 · immediate")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("names a shipped role in the profile's language", () => {
    render(
      <RuntimeSettingsPanel
        applicationName="Explorer Manager"
        baseProfile={{ ...defaultProfile, language: "fr", name: "Operator" }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        overrides={{}}
        runtimeRole="operator"
      />,
    );

    expect(document.querySelector(".runtime-kiosk-role")?.textContent).toBe("Opérateur");
  });

  it("reads a zero dead zone as each control keeping its own, not as no dead zone", () => {
    renderSettings({ deadzone: 0 });
    expect(screen.getByLabelText("Joystick dead zone value").textContent).toBe("each control's own");

    fireEvent.click(screen.getByRole("button", { name: "Increase Joystick dead zone" }));
    expect(screen.getByLabelText("Joystick dead zone value").textContent).toBe("0.05");
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

describe("the keyboard and gamepad card", () => {
  it("says how to drive without touch, and how to attach a pad when none is there", () => {
    renderSettings();

    expect(screen.getByText(/arrow keys drive/)).toBeTruthy();
    expect(screen.getByText(/No gamepad connected/)).toBeTruthy();
  });

  it("names the pad once one is connected", () => {
    render(
      <RuntimeSettingsPanel
        applicationName="Explorer Manager"
        baseProfile={defaultProfile}
        gamepadName="Xbox Wireless Controller"
        onClose={vi.fn()}
        onSave={vi.fn()}
        overrides={{}}
        runtimeRole="operator"
      />,
    );

    expect(screen.getByText(/Gamepad connected: Xbox Wireless Controller/)).toBeTruthy();
  });
});

describe("input methods that drop the saved way to reach STOP", () => {
  it("keeps Touch and Dwell out of the scan while scan is saved; a caregiver's tap still picks them", () => {
    renderSettings({ motorAccessibilityPreset: "scan" });

    for (const name of ["Touch", "Dwell"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("data-scan-touch-only")).toBe(true);
    }
    expect(screen.getByRole("button", { name: "Scan" }).hasAttribute("data-scan-touch-only")).toBe(false);
    expect(screen.getByText(/Touch and Dwell are not scanned/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Touch" }));
    expect(screen.getByRole("button", { name: "Touch" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not let a rest on Touch drop dwell while dwell is saved", () => {
    vi.useFakeTimers();
    renderSettings({ dwellEnabled: true, dwellMs: 400 });
    const touch = screen.getByRole("button", { name: "Touch" });
    expect(screen.getByText(/Touch and Scan do not respond to dwell/)).toBeTruthy();

    act(() => {
      touch.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 100 }));
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: "Dwell" }).getAttribute("aria-pressed")).toBe("true");

    // Other settings still take a dwell.
    act(() => {
      screen
        .getByRole("button", { name: "FR" })
        .dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 400, clientY: 100 }));
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: "FR" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the colours card", () => {
  const renderColours = (props: Partial<Parameters<typeof RuntimeSettingsPanel>[0]> = {}) => {
    const onSave = vi.fn<(next: RuntimeProfileOverrides) => void>();
    const onClose = vi.fn();
    const onPreviewTheme = vi.fn();
    const result = render(
      <RuntimeSettingsPanel
        applicationName="Explorer Manager"
        appThemePresetId="bloom"
        baseProfile={defaultProfile}
        onClose={onClose}
        onPreviewTheme={onPreviewTheme}
        onSave={onSave}
        overrides={{}}
        runtimeRole="operator"
        {...props}
      />,
    );
    const colours = () => within(screen.getByRole("group", { name: "Colours" }));
    return { ...result, colours, onClose, onPreviewTheme, onSave };
  };

  it("offers every vetted palette and Same as app, pressed on the saved choice", () => {
    const { colours } = renderColours();

    expect(
      colours()
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Same as app", "Bloom Garden", "Extender", "High visibility", "Dark", "Colour-blind safe", "Pastel"]);
    expect(colours().getByRole("button", { name: "Same as app" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says Same as role when the role picked a palette of its own", () => {
    const { colours } = renderColours({ baseProfile: { ...defaultProfile, themePresetId: "high-contrast" } });

    expect(colours().getByRole("button", { name: "Same as role" })).toHaveAttribute("aria-pressed", "true");
  });

  it("previews a palette live, saves it for this tablet on Save and resume", () => {
    const { colours, container, onPreviewTheme, onSave } = renderColours();

    fireEvent.click(colours().getByRole("button", { name: "Dark" }));

    const settings = within(container).getByRole("region", { name: "Settings" });
    expect(settings).toHaveAttribute("data-bloom-theme", "dark");
    expect(settings).toHaveStyle({ "--bloom-stop": "#dc2626" });
    expect(onPreviewTheme).toHaveBeenLastCalledWith("dark");
    expect(colours().getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));
    expect(onSave).toHaveBeenCalledWith({ themePresetId: "dark" });
  });

  it("drops the tablet's choice when Same as app is picked, and Discard keeps the saved one", () => {
    const { colours, onClose, onPreviewTheme, onSave, unmount } = renderColours({
      overrides: { themePresetId: "colour-safe" },
    });

    fireEvent.click(colours().getByRole("button", { name: "Same as app" }));
    expect(onPreviewTheme).toHaveBeenLastCalledWith("bloom");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(onPreviewTheme).toHaveBeenLastCalledWith(null);
  });

  it("names the palettes in the operator's language", () => {
    renderColours({ overrides: { language: "fr" } });

    const colours = within(screen.getByRole("group", { name: "Couleurs" }));
    expect(colours.getByRole("button", { name: "Sombre" })).toBeTruthy();
    expect(colours.getByRole("button", { name: "Comme l'app" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps every palette button reachable by switch scanning and dwell", () => {
    const { colours } = renderColours({ overrides: { motorAccessibilityPreset: "scan" } });

    for (const button of colours().getAllByRole("button")) {
      expect(button.matches(SCAN_TARGET_SELECTOR), button.textContent ?? "").toBe(true);
      expect(button).not.toHaveAttribute("data-scan-touch-only");
    }
  });

  it("stores only a vetted palette id as this tablet's override", () => {
    saveRuntimeUserPreferences(
      setRuntimeProfileOverrides(EMPTY_PREFERENCES, { appId: "a", configId: "c" }, "operator", {
        themePresetId: "dark",
      }),
    );
    expect(loadRuntimeUserPreferences().profileOverrides["c:a:operator"]).toEqual({ themePresetId: "dark" });

    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({ profileOverrides: { "c:a:operator": { themePresetId: "neon" } } }),
    );
    expect(loadRuntimeUserPreferences().profileOverrides["c:a:operator"]).toBeUndefined();
  });
});

describe("the practice offer setting", () => {
  function renderHidden() {
    const onRestore = vi.fn();
    const onSave = vi.fn<(next: RuntimeProfileOverrides) => void>();
    render(
      <RuntimeSettingsPanel
        applicationName="Explorer Manager"
        baseProfile={defaultProfile}
        onClose={() => undefined}
        onSave={onSave}
        overrides={{}}
        practiceOffer={{ hidden: true, onRestore }}
        runtimeRole="operator"
      />,
    );
    return { card: screen.getByRole("group", { name: "Practice offer" }), onRestore, onSave };
  }

  it("shows a hidden offer as neither choice, and says how to get it back", () => {
    const { card } = renderHidden();

    expect(within(card).getByRole("button", { name: "Offer at start" })).toHaveAttribute("aria-pressed", "false");
    expect(within(card).getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Hidden for this role on this device. Choose Offer at start to show it again."),
    ).toBeTruthy();
  });

  it("brings a hidden offer back only when Offer at start is chosen and saved", () => {
    const untouched = renderHidden();
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));
    expect(untouched.onRestore).not.toHaveBeenCalled();
    cleanup();

    const { card, onRestore, onSave } = renderHidden();
    fireEvent.click(within(card).getByRole("button", { name: "Offer at start" }));
    expect(within(card).getByRole("button", { name: "Offer at start" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));

    expect(onRestore).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ practiceOffer: "start" }));
  });

  it("turns the offer off for this role without touching the hidden flag", () => {
    const { card, onRestore, onSave } = renderHidden();
    fireEvent.click(within(card).getByRole("button", { name: "Off" }));
    expect(within(card).getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save and resume" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ practiceOffer: "off" }));
    expect(onRestore).not.toHaveBeenCalled();
  });
});
