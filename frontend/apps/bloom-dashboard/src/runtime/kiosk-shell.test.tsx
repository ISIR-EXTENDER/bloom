/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeKioskBar } from "./RuntimeKioskBar";

/**
 * The runtime is what a person in a wheelchair uses to drive an arm mounted to
 * that chair. It used to carry the builder's chrome: an eyebrow, the app name,
 * the profile name, the screen name, a tab row, and a menu with six ways out --
 * Home, App library, Builder, Help, Edit app, Edit screen -- over a diagnostics
 * strip. On the 1024x600 panel that measured 121px of 600, and every exit was
 * one stray tap from a moving arm.
 */
function screenOf(id: string, title: string): ScreenConfig {
  return { id, title, canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets: [] };
}

const application = {
  id: "explorer-manager",
  name: "Explorer Manager",
  screens: [screenOf("drive", "Drive"), screenOf("positions", "Positions")],
} as unknown as ApplicationConfig;

function renderBar(overrides: Partial<Parameters<typeof RuntimeKioskBar>[0]> = {}) {
  const handlers = {
    onSelectScreen: vi.fn(),
    onOpenAppLibrary: vi.fn(),
    onEditScreen: vi.fn(),
    onEditApplication: vi.fn(),
    onOpenLanding: vi.fn(),
    onOpenHelp: vi.fn(),
  };
  render(
    <RuntimeKioskBar
      application={application}
      commandFrameId="base_link"
      profileName="Default"
      screen={application.screens[0] as ScreenConfig}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

const maintenanceButton = () => screen.getByRole("button", { name: "Hold to open maintenance" });
const isOpen = () => screen.queryByRole("dialog", { name: "Maintenance" }) !== null;

function hold(ms: number) {
  fireEvent.pointerDown(maintenanceButton());
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("the kiosk bar", () => {
  afterEach(cleanup);

  it("carries only status, with no way out of the session on it", () => {
    renderBar();

    expect(screen.getByText("Explorer Manager")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    for (const gateway of ["App library", "Edit this screen in the builder", "Home", "Help"]) {
      expect(screen.queryByRole("button", { name: gateway })).toBeNull();
    }
    expect(screen.queryByText("Runtime app")).toBeNull();
  });

  it("names the frame commands are stamped with", () => {
    // cartesian_manager does no TF conversion: a command in another frame is
    // dropped and the arm stops, which looks exactly like a broken UI.
    renderBar();

    expect(screen.getByText("base_link")).toBeTruthy();
  });

  it("shows no frame at all rather than guessing one", () => {
    renderBar({ commandFrameId: null });

    expect(screen.queryByText("base_link")).toBeNull();
  });

  it("carries the status chip as a live status region", () => {
    renderBar({ statusChip: { label: "READY", tone: "ready" } });

    expect(screen.getByRole("status").textContent).toBe("READY");
  });

  it("shows no status chip where there is no session to describe", () => {
    // A status word on a builder preview would be a guess, and the chip's one
    // job is to never guess.
    renderBar();

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the maintenance hold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("ignores a tap", () => {
    renderBar();

    hold(120);
    fireEvent.pointerUp(maintenanceButton());

    expect(isOpen()).toBe(false);
  });

  it("ignores a hold released before 1.5s", () => {
    renderBar();

    hold(1400);
    fireEvent.pointerUp(maintenanceButton());

    expect(isOpen()).toBe(false);
  });

  it("opens after a full 1.5s hold", () => {
    renderBar();

    hold(1600);

    expect(isOpen()).toBe(true);
  });

  it("forgets a cancelled hold instead of resuming it", () => {
    // Otherwise a press half-finished by one person could be completed minutes
    // later by someone who never started it.
    renderBar();

    hold(1200);
    fireEvent.pointerLeave(maintenanceButton());
    hold(600);

    expect(isOpen()).toBe(false);
  });
});

describe("maintenance", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("is where screen switching lives, so a stray tap cannot swap the controls mid-session", () => {
    const handlers = renderBar();
    hold(1600);

    fireEvent.click(screen.getByRole("button", { name: "Positions" }));

    expect(handlers.onSelectScreen).toHaveBeenCalledWith("positions");
    expect(isOpen()).toBe(false);
  });

  it("holds every gateway the bar no longer shows", () => {
    renderBar();
    hold(1600);

    for (const gateway of ["App library", "Edit this screen in the builder", "Edit app", "Help", "Home"]) {
      expect(screen.getByRole("button", { name: gateway })).toBeTruthy();
    }
  });

  it("closes on Escape and on Back to operation", () => {
    renderBar();
    hold(1600);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(isOpen()).toBe(false);

    hold(1600);
    fireEvent.click(screen.getByRole("button", { name: "Back to operation" }));
    expect(isOpen()).toBe(false);
  });
});
