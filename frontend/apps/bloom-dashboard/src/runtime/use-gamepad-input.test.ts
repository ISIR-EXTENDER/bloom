/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyScaledDeadZone, contributionFromAxisMap } from "./teleop-composition";
import { DEFAULT_GAMEPAD_AXIS_MAP, useGamepadInput } from "./use-gamepad-input";

/**
 * The mapping itself, tested without a DOM: the hook is a poll loop around it.
 */
function contributionFromPad(axes: number[], deadzone = 0.12) {
  const contribution: Record<string, number> = {};
  for (const binding of DEFAULT_GAMEPAD_AXIS_MAP) {
    const raw = axes[binding.axis];
    if (typeof raw !== "number") continue;
    contribution[binding.component] =
      (contribution[binding.component] ?? 0) + applyScaledDeadZone(raw, deadzone) * (binding.scale ?? 1);
  }
  return contribution;
}

describe("the default gamepad mapping", () => {
  it("drives translation from the left stick and rotation from the right", () => {
    const contribution = contributionFromPad([1, 0, 0, 0], 0);

    expect(contribution.linear_x).toBe(1);
    expect(contribution.angular_x).toBe(0);
  });

  it("inverts the stick Y axes, which report up as negative", () => {
    // Pushing both sticks forward must move forward and tilt up, not the
    // reverse -- the single most confusing thing a pad can do to an operator.
    const contribution = contributionFromPad([0, -1, 0, -1], 0);

    expect(contribution.linear_y).toBe(1);
    expect(contribution.angular_y).toBe(1);
  });

  it("applies the same scaled dead zone as the touch pads", () => {
    // joystick_mapper's per-axis dead zone, rescaled: at the edge it is zero
    // and there is no step into motion.
    expect(contributionFromPad([0.1, 0, 0, 0], 0.12).linear_x).toBe(0);
    expect(contributionFromPad([1, 0, 0, 0], 0.12).linear_x).toBe(1);
  });

  it("covers every component the touch pads do, and no others", () => {
    const components = DEFAULT_GAMEPAD_AXIS_MAP.map((binding) => binding.component).sort();

    expect(components).toEqual(["angular_x", "angular_y", "linear_x", "linear_y"]);
  });

  it("composes through the same axis-map helper the widgets use", () => {
    const contribution = contributionFromAxisMap(
      { x: { component: "linear_x" }, y: { component: "linear_y" } },
      { x: 0.5, y: -0.5 },
    );

    expect(contribution).toEqual({ linear_x: 0.5, linear_y: -0.5 });
  });
});

describe("gamepad neutral re-arm", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "getGamepads");
  });

  it("ignores a held stick until it has returned to neutral", async () => {
    const axes = [0.8, 0, 0, 0];
    const pad = { axes, id: "Adaptive controller" } as unknown as Gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: vi.fn(() => [pad]),
    });
    const onContribution = vi.fn();

    renderHook(() => useGamepadInput({ deadzone: 0, enabled: true, onContribution }));
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(onContribution).not.toHaveBeenCalled();

    axes[0] = 0;
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(onContribution).not.toHaveBeenCalled();

    axes[0] = 0.8;
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(onContribution).toHaveBeenLastCalledWith(expect.objectContaining({ linear_x: 0.8 }));
  });

  it("requires neutral again after input is suspended", async () => {
    const axes = [0, 0, 0, 0];
    const pad = { axes, id: "Adaptive controller" } as unknown as Gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: vi.fn(() => [pad]),
    });
    const onContribution = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useGamepadInput({ deadzone: 0, enabled, onContribution }), {
      initialProps: { enabled: true },
    });
    await act(() => vi.advanceTimersByTimeAsync(60));
    axes[0] = 0.8;
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(onContribution).toHaveBeenCalled();

    rerender({ enabled: false });
    onContribution.mockClear();
    rerender({ enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(onContribution).not.toHaveBeenCalled();

    axes[0] = 0;
    await act(() => vi.advanceTimersByTimeAsync(60));
    axes[0] = 0.8;
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(onContribution).toHaveBeenLastCalledWith(expect.objectContaining({ linear_x: 0.8 }));
  });
});
