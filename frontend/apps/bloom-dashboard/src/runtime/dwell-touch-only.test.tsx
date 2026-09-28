/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeMaintenanceSheet } from "./RuntimeMaintenanceSheet";
import { getRuntimeStrings } from "./strings";

const drive: ScreenConfig = {
  id: "drive",
  title: "Drive",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [],
};
const application = {
  id: "explorer-manager",
  name: "Explorer Manager",
  screens: [drive],
} as unknown as ApplicationConfig;
const operator = { id: "operator", layoutId: "drive", motorAccessibilityPreset: "dwell" as const, name: "Operator" };
const bench = { id: "bench", layoutId: "drive_bench", motorAccessibilityPreset: "default" as const, name: "Bench" };
const scanner = { id: "scanner", layoutId: "drive", motorAccessibilityPreset: "scan" as const, name: "Scanner" };

const handlers = () => ({
  onClose: vi.fn(),
  onEditApplication: vi.fn(),
  onEditScreen: vi.fn(),
  onLanguageChange: vi.fn(),
  onOpenAppLibrary: vi.fn(),
  onOpenHelp: vi.fn(),
  onOpenLanding: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenSupervisor: vi.fn(),
  onOpenTour: vi.fn(),
  onSelectScreen: vi.fn(),
  onSuspendTeleop: vi.fn(),
  onSwitchProfile: vi.fn(),
});

let restX = 0;
function rest(name: string | RegExp) {
  restX += 100;
  act(() => {
    screen
      .getByRole("button", { name })
      .dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: restX, clientY: 500 }));
  });
  act(() => vi.advanceTimersByTime(1200));
}

describe("maintenance sheet under dwell", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("does not dwell into pages without STOP or dwell, and roles without dwell, and says so", () => {
    const props = handlers();
    render(
      <RuntimeMaintenanceSheet
        application={application}
        commandFrameId="base_link"
        dwell={{ dwellMs: 400, enabled: true }}
        profile={operator}
        profiles={[operator, bench, scanner]}
        rate={30}
        screen={drive}
        strings={getRuntimeStrings("en")}
        {...props}
      />,
    );

    for (const name of [
      "Supervisor mirror",
      "Edit this screen in the builder",
      "Edit app",
      "Help",
      "Home",
      "Exit to library",
    ]) {
      rest(name);
    }
    expect(props.onOpenSupervisor).not.toHaveBeenCalled();
    expect(props.onEditScreen).not.toHaveBeenCalled();
    expect(props.onEditApplication).not.toHaveBeenCalled();
    expect(props.onOpenHelp).not.toHaveBeenCalled();
    expect(props.onOpenLanding).not.toHaveBeenCalled();
    expect(props.onOpenAppLibrary).not.toHaveBeenCalled();
    // No other role has dwell, so the switch itself is touch only.
    expect(screen.getByRole("button", { name: "Hold to switch role" }).hasAttribute("data-scan-touch-only")).toBe(true);
    expect(screen.getByText(/do not respond to dwell/)).toBeTruthy();
    expect(screen.getByText(/Roles without dwell are touch only too/)).toBeTruthy();

    // What keeps STOP and dwell still works by dwell.
    rest("Practice tour");
    expect(props.onOpenTour).toHaveBeenCalledOnce();
  });
  it("offers by dwell only the roles that dwell", () => {
    const helper = { id: "helper", layoutId: "drive", motorAccessibilityPreset: "dwell" as const, name: "Helper" };
    const props = handlers();
    render(
      <RuntimeMaintenanceSheet
        application={application}
        commandFrameId="base_link"
        dwell={{ dwellMs: 400, enabled: true }}
        profile={operator}
        profiles={[operator, bench, scanner, helper]}
        rate={30}
        screen={drive}
        strings={getRuntimeStrings("en")}
        {...props}
      />,
    );
    rest("Hold to switch role");
    rest("Bench");
    rest("Scanner");
    expect(props.onSwitchProfile).not.toHaveBeenCalled();
    rest("Helper");
    expect(props.onSwitchProfile).toHaveBeenCalledWith("helper");
  });
});
