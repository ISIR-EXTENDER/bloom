/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { guidedTourProgressKey, loadGuidedTourProgress } from "../ui/guided-tour-progress";
import { activateAssistively } from "./assistive-activation";
import { RuntimeGuidedTour } from "./RuntimeGuidedTour";
import type { ResolvedRuntimeProfile } from "./runtimeProfile";

const runtimeScreen = {
  id: "drive",
  title: "Drive",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "translation",
      kind: "joystick",
      title: "Translation",
      layout: { x: 0, y: 0, width: 300, height: 300 },
      settings: { labels: { top: "▲ Forward", bottom: "▼ Back", left: "◀ Left", right: "▶ Right" } },
    },
  ],
} as ScreenConfig;

const application = {
  id: "explorer-manager",
  name: "Explorer Manager",
  screens: [runtimeScreen],
} as unknown as ApplicationConfig;

const profile: ResolvedRuntimeProfile = {
  audioCues: false,
  deadzone: 0,
  displayPreset: "comfort",
  dwellEnabled: false,
  dwellMs: 1000,
  fontScale: 1,
  id: "operator",
  language: "en",
  motorAccessibilityPreset: "default",
  name: "Operator",
  repeatGuardMs: 0,
  scanPeriodMs: 1400,
};

const selection = { appId: "explorer-manager", configId: "explorer-manager", screenId: "drive" };

function renderTour(overrides: Partial<Parameters<typeof RuntimeGuidedTour>[0]> = {}) {
  const onDone = vi.fn();
  render(
    <RuntimeGuidedTour
      application={application}
      onDone={onDone}
      profile={profile}
      screen={runtimeScreen}
      selection={selection}
      {...overrides}
    />,
  );
  return { onDone };
}

describe("the runtime guided tour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("advances only through the real local practice actions", () => {
    const { onDone } = renderTour();

    fireEvent.click(screen.getByRole("button", { name: "I've seen it" }));
    expect(screen.getByRole("heading", { name: "Move the arm" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "▲ Forward" }));
    expect(screen.getByText(/Practice movement 1 of 2/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Move the arm" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "▲ Forward" }));
    fireEvent.click(screen.getByRole("button", { name: "STOP" }));
    const resume = screen.getByRole("button", { name: "Hold for one second to resume" });
    fireEvent.pointerDown(resume);
    act(() => vi.advanceTimersByTime(1100));
    fireEvent.pointerUp(resume);

    expect(screen.getByRole("heading", { name: "Make it fit your hand" })).toBeTruthy();
    const maintenance = screen.getByRole("button", { name: "Hold to open maintenance" });
    fireEvent.pointerDown(maintenance);
    act(() => vi.advanceTimersByTime(1600));
    fireEvent.pointerUp(maintenance);

    expect(screen.getByRole("heading", { name: "You're ready" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start for real" }));

    expect(onDone).toHaveBeenCalledOnce();
    expect(loadGuidedTourProgress(guidedTourProgressKey("runtime", selection.configId, selection.appId))).toEqual([
      "screen",
      "move",
      "stop",
      "settings",
      "ready",
    ]);
  });

  it("restores completed checks after a reload", () => {
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "I've seen it" }));
    cleanup();

    renderTour();

    expect(screen.getByRole("button", { name: /This is your screenComplete/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Move the arm" })).toBeTruthy();
  });

  it("uses the selected scan profile on the practice surface", () => {
    renderTour({ profile: { ...profile, motorAccessibilityPreset: "scan" } });
    act(() => vi.advanceTimersByTime(1400));

    expect(screen.getByRole("region", { name: "Practice this app" }).dataset.runtimeScanning).toBe("true");
    expect(screen.getByRole("button", { name: "SWITCH - press Space or tap here" })).toBeTruthy();
  });

  it("labels the practice movement in the operator's language", () => {
    renderTour({ profile: { ...profile, language: "fr" } });
    fireEvent.click(screen.getByRole("button", { name: "Je l'ai vu" }));

    expect(screen.getByRole("button", { name: "▲ Avant" })).toBeTruthy();
    expect(screen.queryByText(/Forward/)).toBeNull();
  });

  // The tour taught one press; the real Resume arms on a switch or dwell press and needs a second to confirm.
  it("practises the real two-press Resume for switch and dwell", () => {
    renderTour({ profile: { ...profile, motorAccessibilityPreset: "scan" } });
    fireEvent.click(screen.getByRole("button", { name: "I've seen it" }));
    fireEvent.click(screen.getByRole("button", { name: "▲ Forward" }));
    fireEvent.click(screen.getByRole("button", { name: "▲ Forward" }));
    fireEvent.click(screen.getByRole("button", { name: "STOP" }));

    const resume = screen.getByRole("button", { name: "Hold for one second to resume" });
    act(() => activateAssistively(resume));
    expect(screen.getByRole("button", { name: "Press again to resume" })).toBeTruthy();
    fireEvent.click(resume, { detail: 0 });
    expect(screen.getByRole("button", { name: "Press again to resume" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(700));
    act(() => activateAssistively(screen.getByRole("button", { name: "Press again to resume" })));
    expect(screen.getByRole("heading", { name: "Make it fit your hand" })).toBeTruthy();
  });
});
