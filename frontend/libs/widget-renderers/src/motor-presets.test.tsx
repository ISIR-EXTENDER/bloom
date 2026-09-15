/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JoystickWidget, SliderWidget } from "./control-renderers";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const controlsScreen: ScreenConfig = {
  id: "drive",
  title: "Drive",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "drive-translation",
      kind: "joystick",
      title: "Translation",
      layout: { x: 0, y: 0, width: 430, height: 440 },
      settings: { labels: { bottom: "Back", left: "Left", right: "Right", top: "Forward" } },
    },
    {
      id: "drive-z",
      kind: "slider",
      title: "Z",
      layout: { x: 0, y: 0, width: 130, height: 440 },
      settings: { direction: "vertical", max: 1, min: -1, returnToCenter: true, step: 0.25 },
    },
  ],
};

function descriptors() {
  const resolved = renderScreenDescriptors(controlsScreen, createDefaultWidgetRegistry());
  const [joystick, slider] = resolved;
  if (joystick?.status !== "resolved" || slider?.status !== "resolved") throw new Error("Missing descriptors.");
  return { joystick, slider };
}

describe("step zones", () => {
  afterEach(cleanup);

  it("turns the joystick into tap-to-increment targets, no dragging required", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="step" onActionIntent={onActionIntent} />);

    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    fireEvent.click(screen.getByRole("button", { name: "Right, one step" }));

    const values = onActionIntent.mock.calls.map(([intent]) => intent.value);
    expect(values).toEqual([
      { x: 0, y: 0.25 },
      { x: 0, y: 0.5 },
      { x: 0.25, y: 0.5 },
    ]);
  });

  it("clamps the stepped vector to unit range", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="step" onActionIntent={onActionIntent} />);

    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    }

    const lastValue = onActionIntent.mock.calls.at(-1)?.[0].value;
    expect(lastValue).toEqual({ x: 0, y: 1 });
  });

  it("stops on the centre target", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="step" onActionIntent={onActionIntent} />);

    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop Translation" }));

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0 });
  });

  it("turns the slider into plus and minus targets with a zero", () => {
    const onActionIntent = vi.fn();
    render(<SliderWidget descriptor={descriptors().slider} motorPreset="step" onActionIntent={onActionIntent} />);

    fireEvent.click(screen.getByRole("button", { name: "Increase Z by 0.25" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Z by 0.25" }));
    fireEvent.click(screen.getByRole("button", { name: "Zero Z" }));

    const values = onActionIntent.mock.calls.map(([intent]) => intent.value);
    expect(values).toEqual([0.25, 0.5, 0]);
  });
});

describe("the latch expiry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("zeroes a stepped vector that outlives attention", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="step" onActionIntent={onActionIntent} />);

    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    act(() => {
      vi.advanceTimersByTime(15500);
    });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0 });
  });

  it("resets the countdown on every new input", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="step" onActionIntent={onActionIntent} />);

    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0.5 });
  });

  it("zeroes a latched slider value after the expiry", () => {
    const onActionIntent = vi.fn();
    render(<SliderWidget descriptor={descriptors().slider} motorPreset="latch" onActionIntent={onActionIntent} />);

    screen.getByRole("slider", { name: "Z" }).focus();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Z" }), { key: "ArrowUp" });
    act(() => {
      vi.advanceTimersByTime(15500);
    });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual(0);
  });
});

describe("the latch preset", () => {
  afterEach(cleanup);

  it("keeps a released slider value instead of springing back", () => {
    const onActionIntent = vi.fn();
    render(<SliderWidget descriptor={descriptors().slider} motorPreset="latch" onActionIntent={onActionIntent} />);

    const slider = screen.getByRole("slider", { name: "Z" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    fireEvent.blur(slider);

    const values = onActionIntent.mock.calls.map(([intent]) => intent.value);
    expect(values).toEqual([0.25]);
  });

  it("gives the latched joystick an explicit zero control", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="latch" onActionIntent={onActionIntent} />);

    expect(screen.getByRole("button", { name: "Zero Translation" })).toBeTruthy();
  });
});

describe("driving the joystick from a keyboard", () => {
  afterEach(cleanup);

  it("nudges with arrows while held and zeroes on release", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} onActionIntent={onActionIntent} />);
    const pad = screen.getByRole("application", { name: "Translation" });

    fireEvent.keyDown(pad, { key: "ArrowUp" });
    fireEvent.keyDown(pad, { key: "ArrowUp" });
    fireEvent.keyUp(pad, { key: "ArrowUp" });

    const values = onActionIntent.mock.calls.map(([intent]) => intent.value);
    expect(values[0]).toEqual({ x: 0, y: 0.1 });
    expect(values[1]).toEqual({ x: 0, y: 0.2 });
    expect(values.at(-1)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the vector on release under the latch preset", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="latch" onActionIntent={onActionIntent} />);
    const pad = screen.getByRole("application", { name: "Translation" });

    fireEvent.keyDown(pad, { key: "ArrowRight" });
    fireEvent.keyUp(pad, { key: "ArrowRight" });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0.1, y: 0 });
  });

  it("zeroes immediately on Escape", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="latch" onActionIntent={onActionIntent} />);
    const pad = screen.getByRole("application", { name: "Translation" });

    fireEvent.keyDown(pad, { key: "ArrowRight" });
    fireEvent.keyUp(pad, { key: "ArrowRight" });
    fireEvent.keyDown(pad, { key: "Escape" });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0 });
  });

  it("treats losing focus as a release, never as a held command", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} onActionIntent={onActionIntent} />);
    const pad = screen.getByRole("application", { name: "Translation" });

    fireEvent.keyDown(pad, { key: "ArrowUp" });
    fireEvent.blur(pad);

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0 });
  });
});
