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
    onOpenSettings: vi.fn(),
    onOpenSupervisor: vi.fn(),
    onOpenTour: vi.fn(),
    onLanguageChange: vi.fn(),
    onSuspendTeleop: vi.fn(),
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
    // The frame decides whether rotation follows the base, end effector, or
    // hybrid operator mapping, so it cannot remain invisible.
    renderBar();

    expect(screen.getByText("base_link")).toBeTruthy();
  });

  it("names the robot this backend drives, and stays silent when unconfigured", () => {
    renderBar({ robotName: "Kinova gen3" });
    expect(screen.getByText("Kinova gen3")).toBeTruthy();
    cleanup();

    renderBar();
    expect(screen.queryByTitle("Robot this backend drives")).toBeNull();
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
    const handlers = renderBar();

    hold(1600);

    expect(isOpen()).toBe(true);
    expect(handlers.onSuspendTeleop).toHaveBeenCalledOnce();
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

    for (const gateway of [
      "Settings",
      "Supervisor mirror",
      "App library",
      "Edit this screen in the builder",
      "Edit app",
      "Help",
      "Home",
    ]) {
      expect(screen.getByRole("button", { name: gateway })).toBeTruthy();
    }
  });

  it("opens the read-only supervisor mirror and closes maintenance", () => {
    const handlers = renderBar();
    hold(1600);

    fireEvent.click(screen.getByRole("button", { name: "Supervisor mirror" }));

    expect(handlers.onOpenSupervisor).toHaveBeenCalledOnce();
    expect(isOpen()).toBe(false);
  });

  it("opens settings from maintenance and removes the maintenance overlay", () => {
    const handlers = renderBar();
    hold(1600);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(handlers.onOpenSettings).toHaveBeenCalledOnce();
    expect(isOpen()).toBe(false);
  });

  it("offers profile language selection inside maintenance", () => {
    const handlers = renderBar();
    hold(1600);

    fireEvent.click(screen.getByRole("button", { name: "ES" }));

    expect(handlers.onLanguageChange).toHaveBeenCalledWith("es");
  });

  it("discloses unsafe fit inside maintenance without covering the controls", () => {
    renderBar({ fitWarning: { authoredHeight: 720, authoredWidth: 1820, shownPercent: 70 } });

    expect(screen.queryByRole("alert")).toBeNull();
    hold(1600);

    expect(screen.getByRole("alert").textContent).toContain(
      "Composed for 1820 × 720, shown at 70%. Targets may be below the 44 px touch floor.",
    );
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
