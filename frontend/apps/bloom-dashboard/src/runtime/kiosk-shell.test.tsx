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
    onReload: vi.fn(),
    onSuspendTeleop: vi.fn(),
    onSwitchProfile: vi.fn(),
  };
  render(
    <RuntimeKioskBar
      application={application}
      commandFrameId="base_link"
      profile={{ id: "operator", layoutId: "drive_operator", name: "Operator" }}
      profiles={[
        { id: "operator", layoutId: "drive_operator", name: "Operator" },
        { id: "bench", layoutId: "drive_bench", name: "Bench" },
      ]}
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
    expect(screen.getByText("Drive")).toBeTruthy();
    expect(screen.getByText("Operator").getAttribute("data-role")).toBe("operator");
    for (const gateway of ["Exit to library", "Edit this screen in the builder", "Home", "Help"]) {
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

  it("says whether it is publishing, and that zeros are held while stopped or in maintenance", () => {
    renderBar();
    expect(screen.getByText("30 Hz")).toBeTruthy();
    cleanup();

    renderBar({ publishing: true, publishRateHz: 20 });
    expect(screen.getByText("publishing · 20 Hz")).toBeTruthy();
    cleanup();

    renderBar({ held: true, publishing: true });
    expect(screen.getByText("zeros held")).toBeTruthy();
  });

  it("draws the bench role apart from the operator's", () => {
    renderBar({ profile: { id: "bench", layoutId: "manager_drive_bench", name: "Bench" } });

    expect(screen.getByText("Bench").getAttribute("data-role")).toBe("bench");
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

  it("drops a keyboard hold when focus leaves before the key is released", () => {
    renderBar();

    fireEvent.keyDown(maintenanceButton(), { key: "Enter" });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.blur(maintenanceButton());
    act(() => {
      vi.advanceTimersByTime(1600);
    });

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

  it("reads six facts without offering to set them", () => {
    renderBar({ controlOwnerLabel: "YOU CONTROL", link: "connected" });
    hold(1600);

    const facts = screen.getByRole("dialog").querySelector("dl");
    expect(facts?.textContent).toContain("Connected");
    expect(facts?.textContent).toContain("you control the robot");
    expect(facts?.textContent).toContain("30 Hz");
    expect(facts?.textContent).toContain("base_link");
    expect(facts?.textContent).toContain("drive_operator");
    expect(facts?.textContent).toContain("explorer-manager");
    expect(screen.getByText("Robot held at zeros")).toBeTruthy();
  });

  it("switches role only after its own hold", () => {
    const handlers = renderBar();
    hold(1600);

    const switchRole = screen.getByRole("button", { name: "Hold to switch role" });
    fireEvent.click(switchRole);
    expect(screen.queryByRole("group", { name: "Choose a role" })).toBeNull();

    fireEvent.pointerDown(switchRole);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    fireEvent.click(screen.getByRole("button", { name: "Bench" }));

    expect(handlers.onSwitchProfile).toHaveBeenCalledWith("bench");
    expect(isOpen()).toBe(false);
  });

  it("drops a keyboard role-switch hold when focus leaves", () => {
    renderBar();
    hold(1600);

    const switchRole = screen.getByRole("button", { name: "Hold to switch role" });
    fireEvent.keyDown(switchRole, { key: " " });
    fireEvent.blur(switchRole);
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.queryByRole("group", { name: "Choose a role" })).toBeNull();
  });

  it("offers no role switch when the app has one profile", () => {
    renderBar({ profiles: [{ id: "operator", layoutId: "", name: "Operator" }] });
    hold(1600);

    expect(screen.queryByRole("button", { name: "Hold to switch role" })).toBeNull();
  });

  it("exits to the library and reloads from the actions", () => {
    const handlers = renderBar();
    hold(1600);

    fireEvent.click(screen.getByRole("button", { name: "Reload this app" }));
    expect(handlers.onReload).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Exit to library" }));
    expect(handlers.onOpenAppLibrary).toHaveBeenCalledOnce();
    expect(isOpen()).toBe(false);
  });

  it("holds every gateway the bar no longer shows", () => {
    renderBar();
    hold(1600);

    for (const gateway of [
      "Settings",
      "Supervisor mirror",
      "Exit to library",
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

  it("closes on Escape, Close and Resume operating", () => {
    renderBar();
    hold(1600);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(isOpen()).toBe(false);

    hold(1600);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(isOpen()).toBe(false);

    hold(1600);
    fireEvent.click(screen.getByRole("button", { name: "Resume operating" }));
    expect(isOpen()).toBe(false);
  });
});
