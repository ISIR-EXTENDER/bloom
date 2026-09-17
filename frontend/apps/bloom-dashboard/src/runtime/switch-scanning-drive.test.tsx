/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler } from "@bloom/widget-renderers";
import { cleanup, render } from "@testing-library/react";
import { act, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { ScreenArtboard } from "../screen/ScreenArtboard";
import { useDwellActivation } from "./use-dwell-activation";
import { useSwitchScanning } from "./use-switch-scanning";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const driveScreen: ScreenConfig = {
  id: "drive",
  title: "Drive",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "translation",
      kind: "joystick",
      title: "Translation",
      layout: { x: 0, y: 0, width: 430, height: 440 },
      settings: { labels: { bottom: "Back", left: "Left", right: "Right", top: "Forward" } },
    },
    {
      id: "height",
      kind: "slider",
      title: "Height",
      layout: { x: 440, y: 0, width: 130, height: 440 },
      settings: { direction: "vertical", max: 1, min: -1, returnToCenter: true, step: 0.25 },
    },
  ],
};

const momentaryScreen: ScreenConfig = {
  id: "modes",
  title: "Modes",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "hold-snake",
      kind: "command-button",
      title: "Snake",
      layout: { x: 0, y: 0, width: 180, height: 72 },
      settings: {
        button_label: "Hold snake",
        messageType: "std_msgs/msg/String",
        momentary: true,
        payload: { data: "geometric/snake" },
        releasedPayload: { data: "geometric/both" },
        topic: "/mode_request",
      },
    },
  ],
};

const joystickLabScreen = explorerManagerConfiguration.applications[0]?.screens.find(
  (screen) => screen.id === "manager_joystick_lab",
) as ScreenConfig | undefined;

function ScannedScreen({
  dwellEnabled = false,
  onActionIntent,
  screen = driveScreen,
}: {
  dwellEnabled?: boolean;
  onActionIntent: WidgetActionIntentHandler;
  screen?: ScreenConfig;
}) {
  const rootRef = useRef(document.body);
  const scanning = useSwitchScanning({ enabled: true, periodMs: 500, rootRef, revision: screen.id });
  useDwellActivation({ dwellMs: 400, enabled: dwellEnabled, rootRef });
  return (
    <>
      <ScreenArtboard
        className="artboard"
        renderEmptyState={() => null}
        rendererOptions={{ motorPreset: "scan", onActionIntent }}
        screen={screen}
      />
      {dwellEnabled ? (
        <button data-scan-switch="" onClick={scanning.activateCurrent} type="button">
          SWITCH
        </button>
      ) : null}
    </>
  );
}

describe("switch scanning on a drive screen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom lays nothing out; the hook only scans what is laid out.
    Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("moves the arm from a scanned direction, and the height from a scanned step", () => {
    const onActionIntent = vi.fn<WidgetActionIntentHandler>();
    render(<ScannedScreen onActionIntent={onActionIntent} />);

    const targets = [...document.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
    expect(targets.slice(0, 5)).toEqual([
      "Forward, one step",
      "Left, one step",
      "Stop Translation",
      "Right, one step",
      "Back, one step",
    ]);
    expect(document.querySelector('[role="application"]')).toBeNull();

    act(() => vi.advanceTimersByTime(500 * 3));
    expect(document.querySelector("[data-scan-lit]")?.getAttribute("aria-label")).toBe("Right, one step");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(onActionIntent.mock.calls.at(-1)?.[0]).toMatchObject({ value: { x: 0.25, y: 0 } });

    act(() => vi.advanceTimersByTime(500 * 2));
    expect(document.querySelector("[data-scan-lit]")?.getAttribute("aria-label")).toBe("Increase Height by 0.25");
    act(() => window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(onActionIntent.mock.calls.at(-1)?.[0]).toMatchObject({ value: 0.25 });
  });

  it("makes every Joystick lab action reachable by switch scanning", () => {
    if (!joystickLabScreen) {
      throw new Error("Explorer Manager seed is missing the Joystick lab screen.");
    }
    render(<ScannedScreen onActionIntent={vi.fn()} screen={joystickLabScreen} />);

    const targets = [...document.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));
    // The screen has 24 operator controls plus the topic echo's three local
    // inspection controls. Center-reset buttons start disabled at zero and
    // join the scan automatically after either slider moves.
    expect(targets).toHaveLength(27);
    expect(targets).toEqual(
      expect.arrayContaining([
        "Base",
        "Tool",
        "Hybrid",
        "Force sensor",
        "Both",
        "Jaco",
        "Hold snake",
        "Gripper: Close gripper",
        "Stop Translation",
        "Stop Rotation",
        "Increase Height by 0.01",
        "Decrease Pivot by 0.01",
      ]),
    );
  });

  it("lets dwell on the switch bar activate the highlighted scan direction", () => {
    const onActionIntent = vi.fn<WidgetActionIntentHandler>();
    render(<ScannedScreen dwellEnabled onActionIntent={onActionIntent} />);

    expect(document.querySelector("[data-scan-lit]")?.getAttribute("aria-label")).toBe("Forward, one step");
    const switchBar = document.querySelector<HTMLElement>("[data-scan-switch]");
    if (!switchBar) {
      throw new Error("Missing scan switch bar.");
    }

    act(() => switchBar.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(400));

    expect(onActionIntent).toHaveBeenLastCalledWith(expect.objectContaining({ value: { x: 0, y: 0.25 } }));
    expect(switchBar).toHaveFocus();
  });

  it("engages and releases a momentary mode button from the switch", () => {
    // Hold snake is a hold, and a switch user has no hold: scanning it must
    // latch the mode, and the next activation must publish the release.
    const onActionIntent = vi.fn<WidgetActionIntentHandler>();
    render(<ScannedScreen onActionIntent={onActionIntent} screen={momentaryScreen} />);

    expect(document.querySelector("[data-scan-lit]")?.getAttribute("aria-label")).toBe("Hold snake");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: { data: "geometric/snake" }, topic: "/mode_request" }),
    );

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: { data: "geometric/both" }, topic: "/mode_request" }),
    );
  });
});
