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
});
