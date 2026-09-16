/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCAN_TARGET_SELECTOR, useSwitchScanning } from "./use-switch-scanning";

function buildScreen(buttonCount: number) {
  const root = document.createElement("div");
  const clicks: string[] = [];
  for (let index = 0; index < buttonCount; index += 1) {
    const button = document.createElement("button");
    button.textContent = `target-${index}`;
    button.addEventListener("click", () => clicks.push(`target-${index}`));
    // jsdom leaves offsetParent null; the hook filters on it for visibility.
    Object.defineProperty(button, "offsetParent", { get: () => root });
    root.append(button);
  }
  document.body.append(root);
  return { clicks, root, rootRef: { current: root } };
}

describe("switch scanning", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("lights the first control immediately, so nothing waits a full period", () => {
    const { root, rootRef } = buildScreen(3);

    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(root.querySelectorAll("[data-scan-lit]")).toHaveLength(1);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-0");
  });

  it("walks the controls at the configured period and wraps around", () => {
    const { root, rootRef } = buildScreen(3);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    vi.advanceTimersByTime(1000);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-1");
    vi.advanceTimersByTime(2000);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-0");
  });

  it("fires the lit control on Space", () => {
    const { clicks, rootRef } = buildScreen(3);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

    expect(clicks).toEqual(["target-1"]);
  });

  it("accepts a tap anywhere as the switch", () => {
    // A switch box, a sip-puff and a button all arrive as one of these.
    const { clicks, rootRef } = buildScreen(2);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(clicks).toEqual(["target-0"]);
  });

  it("leaves a direct tap on a control alone", () => {
    const { clicks, root, rootRef } = buildScreen(2);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    const second = root.querySelectorAll("button")[1];
    second?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(clicks).toEqual([]);
  });

  it("scans nothing and clears the highlight when disabled", () => {
    const { root, rootRef } = buildScreen(3);
    const { rerender } = renderHook(
      ({ enabled }) => useSwitchScanning({ enabled, periodMs: 1000, rootRef, revision: "a" }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    expect(root.querySelectorAll("[data-scan-lit]")).toHaveLength(0);
  });

  it("reports how far along the scan is, for the live status line", () => {
    const { rootRef } = buildScreen(4);
    const { result } = renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(result.current).toMatchObject({ index: 0, targetCount: 4 });
    expect(result.current.activateCurrent).toEqual(expect.any(Function));
  });

  it("scans only what a click can operate", () => {
    // A pad answers to pointer and keys, never to click(): lighting it would
    // look usable and move nothing. Pads render step targets under scan instead.
    expect(SCAN_TARGET_SELECTOR).toContain("button");
    expect(SCAN_TARGET_SELECTOR).not.toContain('role="application"');
    expect(SCAN_TARGET_SELECTOR).not.toContain('role="slider"');
  });

  it("treats the switch bar as the switch, not as a target", () => {
    const { clicks, root, rootRef } = buildScreen(2);
    const bar = document.createElement("button");
    bar.setAttribute("data-scan-switch", "");
    Object.defineProperty(bar, "offsetParent", { get: () => root });
    root.append(bar);
    const { result } = renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(result.current.targetCount).toBe(2);
    bar.addEventListener("click", result.current.activateCurrent);
    bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    bar.click();

    expect(clicks).toEqual(["target-0"]);
  });
});
