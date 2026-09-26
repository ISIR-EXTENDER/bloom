/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCAN_TARGET_SELECTOR, useSwitchScanning } from "./use-switch-scanning";

// jsdom lays nothing out: getClientRects() is empty until a test gives an element a box.
function layOut(element: HTMLElement) {
  element.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
}

function buildScreen(buttonCount: number) {
  const root = document.createElement("div");
  const clicks: string[] = [];
  for (let index = 0; index < buttonCount; index += 1) {
    const button = document.createElement("button");
    button.textContent = `target-${index}`;
    button.addEventListener("click", () => clicks.push(`target-${index}`));
    layOut(button);
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

  it("opens every cycle with the priority target, wherever it is drawn", () => {
    // STOP is runtime chrome outside the scanned screen; last in the cycle it
    // was half a minute away at a 1400 ms period.
    const { root, rootRef } = buildScreen(3);
    const stop = document.createElement("button");
    stop.setAttribute("data-scan-priority", "stop");
    stop.textContent = "Stop the robot";
    layOut(stop);
    document.body.append(stop);

    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(document.querySelector("[data-scan-lit]")?.textContent).toBe("Stop the robot");
    vi.advanceTimersByTime(1000);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-0");
    vi.advanceTimersByTime(3000);
    expect(document.querySelector("[data-scan-lit]")?.textContent).toBe("Stop the robot");
  });

  // Over settings and the tour STOP is position: fixed, so its offsetParent is null although it is on screen.
  it("scans a fixed STOP and skips a control with no box", () => {
    const { rootRef } = buildScreen(2);
    const stop = document.createElement("button");
    stop.setAttribute("data-scan-priority", "stop");
    stop.textContent = "Stop the robot";
    layOut(stop);
    const hidden = document.createElement("button");
    hidden.textContent = "hidden";
    rootRef.current.append(hidden);
    document.body.append(stop);
    expect(stop.offsetParent).toBeNull();

    const { result } = renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(document.querySelector("[data-scan-lit]")?.textContent).toBe("Stop the robot");
    expect(result.current.targetCount).toBe(3);
  });

  // Keep going exists for five seconds before a latch lets go; waiting its turn in a 28 s cycle, it never came.
  it("lights a control that just appeared for a moment at the next step", () => {
    const { root, rootRef } = buildScreen(6);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));
    vi.advanceTimersByTime(1000);

    const keep = document.createElement("button");
    keep.setAttribute("data-scan-urgent", "");
    keep.textContent = "Keep going";
    layOut(keep);
    root.append(keep);
    vi.advanceTimersByTime(1000);

    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("Keep going");
    // Then back to where it was, so nothing in the cycle, STOP included, loses its place.
    vi.advanceTimersByTime(1000);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-2");
  });

  it("holds the highlight on an armed control until it fires or disarms", () => {
    const { root, rootRef } = buildScreen(3);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));
    const first = root.querySelector("button") as HTMLButtonElement;
    first.setAttribute("data-armed", "true");

    vi.advanceTimersByTime(2000);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-0");

    first.removeAttribute("data-armed");
    vi.advanceTimersByTime(1000);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-1");
  });

  // A button armed until pressed again must not hold the scan for ever: STOP would be out of reach.
  it("moves on after two periods even when the control stays armed", () => {
    const { root, rootRef } = buildScreen(3);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));
    (root.querySelector("button") as HTMLButtonElement).setAttribute("data-armed", "true");

    vi.advanceTimersByTime(3000);

    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-1");
  });

  // Many switch boxes send a held key; the auto-repeat armed and then confirmed Go home in one long press.
  it("activates once for a held switch", () => {
    const { clicks, rootRef } = buildScreen(3);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true }));

    expect(clicks).toEqual(["target-0"]);
  });

  it("leaves Enter on a focused STOP to STOP", () => {
    const { clicks, rootRef } = buildScreen(3);
    const stop = document.createElement("button");
    stop.setAttribute("data-scan-priority", "stop");
    layOut(stop);
    document.body.append(stop);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));
    vi.advanceTimersByTime(1000);

    const enter = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
    stop.dispatchEvent(enter);

    expect(clicks).toEqual([]);
    expect(enter.defaultPrevented).toBe(false);
  });

  it("takes a switch press on a focused Resume as the switch", () => {
    const { clicks, rootRef } = buildScreen(2);
    const resume = document.createElement("button");
    resume.setAttribute("data-scan-priority", "stop");
    resume.setAttribute("data-stopped", "true");
    layOut(resume);
    document.body.append(resume);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));
    vi.advanceTimersByTime(1000);
    resume.focus();

    const space = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
    document.activeElement?.dispatchEvent(space);

    expect(clicks).toEqual(["target-0"]);
    expect(space.defaultPrevented).toBe(true);
  });

  it("starts the cycle again when the lit control was replaced, instead of skipping its replacement", () => {
    const { root, rootRef } = buildScreen(2);
    const stop = document.createElement("button");
    stop.setAttribute("data-scan-priority", "stop");
    stop.textContent = "Stop the robot";
    layOut(stop);
    document.body.append(stop);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));
    expect(document.querySelector("[data-scan-lit]")).toBe(stop);

    const remounted = stop.cloneNode(true) as HTMLButtonElement;
    remounted.removeAttribute("data-scan-lit");
    layOut(remounted);
    stop.replaceWith(remounted);
    vi.advanceTimersByTime(1000);

    expect(document.querySelector("[data-scan-lit]")).toBe(remounted);
    vi.advanceTimersByTime(1000);
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

  // A command button disables itself while its command is in flight, so the lit control can leave the
  // scan set between two ticks. Leaving it lit puts two highlights on the screen, and the operator's
  // switch fires the one they were not looking at.
  it("takes the highlight off a control that leaves the scan set", () => {
    const { root, rootRef } = buildScreen(3);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    vi.advanceTimersByTime(1000);
    const lit = root.querySelector<HTMLButtonElement>("[data-scan-lit]");
    expect(lit?.textContent).toBe("target-1");

    lit?.setAttribute("disabled", "");
    vi.advanceTimersByTime(1000);

    const stillLit = [...root.querySelectorAll("[data-scan-lit]")].map((element) => element.textContent);
    expect(stillLit).toHaveLength(1);
    expect(stillLit).not.toContain("target-1");
  });

  // The latch can engage between the tick that lit a control and the switch press that fires it. A
  // stopped control is only aria-disabled, so a programmatic click still reaches it; ask again first.
  it("refuses to fire a control that stopped being allowed since it was lit", () => {
    const { clicks, rootRef } = buildScreen(3);
    let allowed = true;
    renderHook(() =>
      useSwitchScanning({
        enabled: true,
        isTargetEnabled: () => allowed,
        periodMs: 1000,
        rootRef,
        revision: "a",
      }),
    );

    vi.advanceTimersByTime(1000);
    allowed = false;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));

    expect(clicks).toEqual([]);
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

  it("limits scanning to the controls allowed by the current safety state", () => {
    const { clicks, root, rootRef } = buildScreen(3);
    root.querySelectorAll("button")[1]?.setAttribute("data-control-independent", "");
    const { result } = renderHook(() =>
      useSwitchScanning({
        enabled: true,
        isTargetEnabled: (target) => target.hasAttribute("data-control-independent"),
        periodMs: 1000,
        rootRef,
        revision: "blocked",
      }),
    );

    expect(result.current.targetCount).toBe(1);
    expect(root.querySelector("[data-scan-lit]")?.textContent).toBe("target-1");
    result.current.activateCurrent();
    expect(clicks).toEqual(["target-1"]);
  });

  it("reports how far along the scan is, for the live status line", () => {
    const { rootRef } = buildScreen(4);
    const { result } = renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(result.current).toMatchObject({ index: 0, targetCount: 4 });
    expect(result.current.activateCurrent).toEqual(expect.any(Function));
  });

  it("leaves a switch press inside an open dialog to the dialog", () => {
    const { clicks, rootRef } = buildScreen(2);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));

    expect(clicks).toEqual([]);
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
    layOut(bar);
    root.append(bar);
    const { result } = renderHook(() => useSwitchScanning({ enabled: true, periodMs: 1000, rootRef, revision: "a" }));

    expect(result.current.targetCount).toBe(2);
    bar.addEventListener("click", result.current.activateCurrent);
    bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    bar.click();

    expect(clicks).toEqual(["target-0"]);
  });
});
