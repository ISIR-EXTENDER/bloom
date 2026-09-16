/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler } from "@bloom/widget-renderers";
import { cleanup, render } from "@testing-library/react";
import { act, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenArtboard } from "../screen/ScreenArtboard";
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

function ScannedScreen({ onActionIntent }: { onActionIntent: WidgetActionIntentHandler }) {
  const rootRef = useRef(document.body);
  useSwitchScanning({ enabled: true, periodMs: 500, rootRef, revision: "drive" });
  return (
    <ScreenArtboard
      className="artboard"
      renderEmptyState={() => null}
      rendererOptions={{ motorPreset: "scan", onActionIntent }}
      screen={driveScreen}
    />
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
});
