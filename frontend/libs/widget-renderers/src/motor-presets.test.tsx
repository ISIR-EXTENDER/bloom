/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import { JoystickWidget } from "./joystick-renderer";
import { SliderWidget } from "./slider-renderer";

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
    // Read aloud and on screen as two values, not "0.25y 0.50".
    expect(document.querySelector(".bloom-control-vector-readout")?.textContent).toBe("x 0.25 y 0.50");
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

  it("uses the same discrete targets for dwell, with no drag-only controls", () => {
    const onActionIntent = vi.fn();
    const { joystick, slider } = descriptors();
    const { container } = render(
      <>
        <JoystickWidget descriptor={joystick} motorPreset="dwell" onActionIntent={onActionIntent} />
        <SliderWidget descriptor={slider} motorPreset="dwell" onActionIntent={onActionIntent} />
      </>,
    );

    expect(container.querySelectorAll('[data-motor-preset="dwell"]')).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Forward, one step" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Increase Z by 0.25" })).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("renders nothing but buttons under switch scanning, so every axis is a scan target", () => {
    const onActionIntent = vi.fn();
    const { joystick, slider } = descriptors();
    const { container } = render(
      <>
        <JoystickWidget descriptor={joystick} motorPreset="scan" onActionIntent={onActionIntent} />
        <SliderWidget descriptor={slider} motorPreset="scan" onActionIntent={onActionIntent} />
      </>,
    );

    expect(container.querySelectorAll('[data-motor-preset="scan"]')).toHaveLength(2);
    expect(container.querySelector('[role="application"]')).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back, one step" }));
    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: -0.25 });
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

  it("expires a stepped vector even while the screen keeps re-rendering", () => {
    // Scanning, telemetry and status polls re-render the runtime every second or
    // two. A window restarted by each render never closes, and the arm keeps moving.
    const onActionIntent = vi.fn();
    const { joystick } = descriptors();
    const { rerender } = render(
      <JoystickWidget descriptor={joystick} motorPreset="scan" onActionIntent={onActionIntent} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    for (let second = 0; second < 16; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender(<JoystickWidget descriptor={joystick} motorPreset="scan" onActionIntent={onActionIntent} />);
    }

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0 });
  });

  it("counts a repeated tap at full scale as renewed attention", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="step" onActionIntent={onActionIntent} />);

    for (let tap = 0; tap < 6; tap += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    }
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 1 });
  });

  it("expires a stepped slider value even while the screen keeps re-rendering", () => {
    const onActionIntent = vi.fn();
    const { slider } = descriptors();
    const { rerender } = render(
      <SliderWidget descriptor={slider} motorPreset="step" onActionIntent={onActionIntent} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase Z by 0.25" }));
    for (let second = 0; second < 16; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      rerender(<SliderWidget descriptor={slider} motorPreset="step" onActionIntent={onActionIntent} />);
    }

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual(0);
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

describe("after the runtime neutralizes teleop", () => {
  afterEach(cleanup);

  it("starts a stepped joystick from rest instead of the stale vector", () => {
    // STOP, a hidden tab or lost control zero the robot. A control still
    // holding y=0.5 would make the next tap jump to 0.75 from rest.
    const onActionIntent = vi.fn();
    const { joystick } = descriptors();
    const { rerender } = render(
      <JoystickWidget descriptor={joystick} motorPreset="step" neutralRevision={0} onActionIntent={onActionIntent} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    const emittedBeforeReset = onActionIntent.mock.calls.length;

    rerender(
      <JoystickWidget descriptor={joystick} motorPreset="step" neutralRevision={1} onActionIntent={onActionIntent} />,
    );
    expect(onActionIntent.mock.calls.length).toBe(emittedBeforeReset);
    expect(screen.getByText("y 0.00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Forward, one step" }));
    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0.25 });
  });

  it("starts a stepped slider from rest but keeps a configured value", () => {
    const onActionIntent = vi.fn();
    const { slider } = descriptors();
    const speed = {
      ...slider,
      widget: {
        ...slider.widget,
        id: "speed",
        title: "Speed",
        settings: { direction: "vertical", max: 1, min: 0, step: 0.05, value: 0.15 },
      },
    };
    const view = (revision: number) => (
      <>
        <SliderWidget
          descriptor={slider}
          motorPreset="step"
          neutralRevision={revision}
          onActionIntent={onActionIntent}
        />
        <SliderWidget
          descriptor={speed}
          motorPreset="step"
          neutralRevision={revision}
          onActionIntent={onActionIntent}
        />
      </>
    );
    const { rerender } = render(view(0));
    fireEvent.click(screen.getByRole("button", { name: "Increase Z by 0.25" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Speed by 0.05" }));

    rerender(view(1));
    fireEvent.click(screen.getByRole("button", { name: "Increase Z by 0.25" }));
    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toBe(0.25);
    // A speed limit is not a held command; the robot still has 0.2.
    fireEvent.click(screen.getByRole("button", { name: "Increase Speed by 0.05" }));
    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toBe(0.25);
  });
});

describe("a zeroed latched joystick", () => {
  afterEach(cleanup);

  it("resumes the next arrow from rest, not from the old pad position", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={descriptors().joystick} motorPreset="latch" onActionIntent={onActionIntent} />);
    const pad = screen.getByRole("application", { name: "Translation" });
    for (let press = 0; press < 5; press += 1) {
      fireEvent.keyDown(pad, { key: "ArrowRight" });
      fireEvent.keyUp(pad, { key: "ArrowRight" });
    }

    fireEvent.click(screen.getByRole("button", { name: "Zero Translation" }));
    fireEvent.keyDown(pad, { key: "ArrowRight" });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0.1, y: 0 });
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

describe("a joystick authored not to zero on release", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function holdingJoystick() {
    const { joystick } = descriptors();
    return {
      ...joystick,
      widget: { ...joystick.widget, settings: { ...joystick.widget.settings, zero_on_release: false } },
    };
  }

  it("offers a zero control and expires the held vector like the latch preset", () => {
    const onActionIntent = vi.fn();
    render(<JoystickWidget descriptor={holdingJoystick()} onActionIntent={onActionIntent} />);
    const pad = screen.getByRole("application", { name: "Translation" });

    fireEvent.keyDown(pad, { key: "ArrowRight" });
    fireEvent.keyUp(pad, { key: "ArrowRight" });
    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0.1, y: 0 });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zero Translation" }).disabled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(15500);
    });

    expect(onActionIntent.mock.calls.at(-1)?.[0].value).toEqual({ x: 0, y: 0 });
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

describe("per-profile signal conditioning", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const commandScreen: ScreenConfig = {
    id: "actions",
    title: "Actions",
    canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    widgets: [
      {
        id: "go-home",
        kind: "command-button",
        title: "Home",
        layout: { x: 0, y: 0, width: 200, height: 110 },
        settings: { button_label: "Go home", command: "behaviour/joint_target/home" },
      },
    ],
  };

  function renderCommand(repeatGuardMs?: number) {
    const [descriptor] = renderScreenDescriptors(commandScreen, createDefaultWidgetRegistry());
    if (descriptor?.status !== "resolved") throw new Error("Missing descriptor.");
    const onActionIntent = vi.fn();
    render(
      <CommandLikeWidget conditioning={{ repeatGuardMs }} descriptor={descriptor} onActionIntent={onActionIntent} />,
    );
    return onActionIntent;
  }

  it("drops a second activation inside the guard window", () => {
    const onActionIntent = renderCommand(400);
    const button = screen.getByRole("button", { name: "Go home" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
  });

  it("allows the same control again once the window passes", () => {
    const onActionIntent = renderCommand(400);
    const button = screen.getByRole("button", { name: "Go home" });

    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(button);

    expect(onActionIntent).toHaveBeenCalledTimes(2);
  });

  it("leaves activation untouched when no guard is configured", () => {
    const onActionIntent = renderCommand();
    const button = screen.getByRole("button", { name: "Go home" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onActionIntent).toHaveBeenCalledTimes(2);
  });

  it("lets the profile dead zone override the widget's own", () => {
    const onActionIntent = vi.fn();
    render(
      <JoystickWidget
        conditioning={{ deadzone: 0.4 }}
        descriptor={descriptors().joystick}
        onActionIntent={onActionIntent}
      />,
    );

    // The pad renders the profile's dead zone, not the widget default of 0.1.
    const pad = screen.getByRole("application", { name: "Translation" });
    expect(pad.querySelector(".bloom-joystick-deadzone")?.getAttribute("style")).toContain("0.4");
  });
});

describe("what a step slider's title reads as", () => {
  afterEach(cleanup);

  it("keeps a space between the title and its unit", () => {
    // Scanning announced "Max speedm/s" and "Max turnrad/s".
    const screenConfig: ScreenConfig = {
      ...controlsScreen,
      widgets: [
        {
          id: "max-speed",
          kind: "slider",
          title: "Max speed",
          layout: { x: 0, y: 0, width: 240, height: 200 },
          settings: { max: 0.3, min: 0, step: 0.015, unit: "m/s" },
        },
      ],
    };
    const [descriptor] = renderScreenDescriptors(screenConfig, createDefaultWidgetRegistry());
    if (descriptor?.status !== "resolved") {
      throw new Error("Missing descriptor.");
    }

    render(<SliderWidget descriptor={descriptor} motorPreset="step" />);

    expect(screen.getByText(/Max speed/).textContent).toBe("Max speed m/s");
  });
});
