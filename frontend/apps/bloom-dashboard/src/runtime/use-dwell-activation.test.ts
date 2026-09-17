/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDwellActivation } from "./use-dwell-activation";

function buildTarget() {
  const root = document.createElement("div");
  const button = document.createElement("button");
  const onClick = vi.fn();
  button.addEventListener("click", onClick);
  root.append(button);
  document.body.append(root);
  return { button, onClick, rootRef: { current: root } };
}

describe("dwell activation", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("activates a control after the configured rest and focuses it", () => {
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 800, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(800));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
    expect(button.style.getPropertyValue("--bloom-dwell-progress")).toBe("1");
  });

  it("restarts the dwell while the pointer is still crossing the control", () => {
    // Sweeping across ▲ Forward on the way elsewhere published motion.
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 800, enabled: true, rootRef }));

    for (let step = 0; step < 10; step += 1) {
      act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: step * 20 })));
      act(() => vi.advanceTimersByTime(120));
    }

    expect(onClick).not.toHaveBeenCalled();
  });

  it("ignores tremor under the rest tolerance", () => {
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 800, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, clientY: 100 })));
    act(() => vi.advanceTimersByTime(400));
    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 103, clientY: 102 })));
    act(() => vi.advanceTimersByTime(400));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cancels an incomplete dwell when the pointer leaves", () => {
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 800, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(400));
    act(() => rootRef.current.dispatchEvent(new PointerEvent("pointerleave")));
    act(() => vi.advanceTimersByTime(800));

    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute("data-dwell-active");
    expect(button.style.getPropertyValue("--bloom-dwell-progress")).toBe("");
  });

  it("fires only once until the pointer leaves and returns", () => {
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 400, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(1200));
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => rootRef.current.dispatchEvent(new PointerEvent("pointerleave")));
    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(400));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the profile does not enable dwell", () => {
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 400, enabled: false, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(800));

    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute("data-dwell-active");
  });

  it("honours a safety-critical target minimum before using a custom activation", () => {
    const { button, onClick, rootRef } = buildTarget();
    const activateTarget = vi.fn();
    button.dataset.dwellMinMs = "1000";
    renderHook(() => useDwellActivation({ activateTarget, dwellMs: 400, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(800));
    expect(activateTarget).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));

    expect(activateTarget).toHaveBeenCalledWith(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("abandons a rest when the control turns into a different action under the pointer", () => {
    // STOP becomes Resume in place. A rest that began on STOP must not
    // complete as a resume a second after the operator pressed STOP.
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 1000, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(300));
    button.dataset.dwellAction = "resume";
    act(() => vi.advanceTimersByTime(3000));

    expect(onClick).not.toHaveBeenCalled();
    expect(button.hasAttribute("data-dwell-active")).toBe(false);
  });

  it("abandons a rest when its control is replaced", () => {
    const { button, onClick, rootRef } = buildTarget();
    renderHook(() => useDwellActivation({ dwellMs: 800, enabled: true, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(300));
    button.remove();
    act(() => vi.advanceTimersByTime(2000));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("ignores controls rejected by the current safety state", () => {
    const { button, onClick, rootRef } = buildTarget();
    const isTargetEnabled = vi.fn(() => false);
    renderHook(() => useDwellActivation({ dwellMs: 400, enabled: true, isTargetEnabled, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(800));

    expect(isTargetEnabled).toHaveBeenCalledWith(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute("data-dwell-active");
  });

  it("abandons a rest that began before the safety state rejected its control", () => {
    // Resting on "Forward, one step" while STOP engages: the click the dwell
    // would send is programmatic, so the canvas' pointer-events: none is no
    // defence against it.
    const { button, onClick, rootRef } = buildTarget();
    let stopped = false;
    renderHook(() => useDwellActivation({ dwellMs: 800, enabled: true, isTargetEnabled: () => !stopped, rootRef }));

    act(() => button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })));
    act(() => vi.advanceTimersByTime(400));
    stopped = true;
    act(() => vi.advanceTimersByTime(800));

    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveAttribute("data-dwell-active");
  });
});
