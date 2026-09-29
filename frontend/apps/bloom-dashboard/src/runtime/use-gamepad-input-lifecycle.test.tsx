/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGamepadInput } from "./use-gamepad-input";

type Contribution = Record<string, number> | null;

/** A pad the browser reports, or none; and the twists the hook hands the composer, in order. */
function harness(axes: number[] | null, id = "Adaptive controller") {
  const pads: { current: Gamepad[] } = { current: axes ? [{ axes, id } as unknown as Gamepad] : [] };
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads.current });
  const sent: Contribution[] = [];
  const hook = renderHook(() =>
    useGamepadInput({ deadzone: 0, enabled: true, onContribution: (c) => sent.push(c as Contribution) }),
  );
  return { hook, pads, sent };
}

const tick = () => act(() => vi.advanceTimersByTimeAsync(60));

describe("the gamepad over a session", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "getGamepads");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("reports the pad it found and the one that arrives later", async () => {
    const { hook, pads } = harness(null);
    expect(hook.result.current).toEqual({ connected: false, id: "" });
    pads.current = [{ axes: [0, 0, 0, 0], id: "Logitech F310" } as unknown as Gamepad];
    act(() => window.dispatchEvent(new Event("gamepadconnected")));
    expect(hook.result.current).toEqual({ connected: true, id: "Logitech F310" });
    pads.current = [];
    act(() => window.dispatchEvent(new Event("gamepaddisconnected")));
    expect(hook.result.current).toEqual({ connected: false, id: "" });
  });

  it("sends one zero when the stick is released, then nothing while it rests", async () => {
    const axes = [0, 0, 0, 0];
    const { sent } = harness(axes);
    await tick();
    axes[0] = 0.5;
    await tick();
    await tick();
    expect(sent).toHaveLength(2);
    axes[0] = 0;
    await tick();
    await tick();
    await tick();
    expect(sent.at(-1)).toBeNull();
    expect(sent).toHaveLength(3);
  });

  it("releases the twist when the pad is unplugged mid-motion, and re-arms on its return", async () => {
    const axes = [0, 0, 0, 0];
    const { pads, sent } = harness(axes);
    await tick();
    axes[0] = 0.5;
    await tick();
    expect(sent.at(-1)).toMatchObject({ linear_x: 0.5 });
    pads.current = [];
    await tick();
    expect(sent.at(-1)).toBeNull();
    // Back with the stick still held: nothing moves until it has been let go.
    pads.current = [{ axes, id: "pad" } as unknown as Gamepad];
    await tick();
    expect(sent.at(-1)).toBeNull();
    axes[0] = 0;
    await tick();
    axes[0] = 0.4;
    await tick();
    expect(sent.at(-1)).toMatchObject({ linear_x: 0.4 });
  });

  it("stops driving when the tab is hidden or loses focus, and requires neutral once it is back", async () => {
    const axes = [0, 0, 0, 0];
    const { sent } = harness(axes);
    await tick();
    axes[0] = 0.5;
    await tick();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(sent.at(-1)).toBeNull();
    await tick();
    expect(sent).toHaveLength(2);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick();
    expect(sent).toHaveLength(2);
    axes[0] = 0;
    await tick();
    axes[0] = 0.3;
    await tick();
    expect(sent.at(-1)).toMatchObject({ linear_x: 0.3 });

    act(() => window.dispatchEvent(new Event("blur")));
    expect(sent.at(-1)).toBeNull();
    act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    expect(sent.filter((entry) => entry === null)).toHaveLength(2);
  });

  it("lets go of the robot when the hook unmounts mid-motion", async () => {
    const axes = [0, 0, 0, 0];
    const { hook, sent } = harness(axes);
    await tick();
    axes[0] = 0.5;
    await tick();
    hook.unmount();
    expect(sent.at(-1)).toBeNull();
  });
});
