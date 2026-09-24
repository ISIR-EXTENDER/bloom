/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { normalizeJoystickVector } from "./JoystickPrimitive";
import { JoystickWidget } from "./joystick-renderer";
import { SliderWidget } from "./slider-renderer";

/**
 * With `show_details` on, the joystick prints a strip of runtime facts so an
 * operator can confirm the widget is wired to what they think it is.
 *
 * The target slot used to come from `resolveJoystickBinding`, which falls back
 * to the legacy `binding` setting and finally to the literal string "input".
 * On the Drive screen, where the joysticks carry a teleop runtime binding with
 * no `target`, that printed "translation" and "rotation" in a slot that reads
 * as a topic, while the joysticks were publishing to
 * `/joystick_cartesian_command`.
 */
function renderJoystick(settings: Record<string, unknown>) {
  render(
    <JoystickWidget
      descriptor={
        {
          widget: {
            id: "drive-translation",
            kind: "joystick",
            title: "Translation",
            layout: { x: 0, y: 0, width: 200, height: 200 },
            settings: { show_details: true, ...settings },
          },
        } as never
      }
    />,
  );
}

function targetSlot() {
  const strip = screen.getByRole("note");
  const slots = within(strip).getAllByText(/.+/);
  return slots[slots.length - 1]?.textContent ?? "";
}

describe("the joystick runtime detail strip", () => {
  afterEach(cleanup);

  it("shows the topic a teleop joystick really publishes to", () => {
    renderJoystick({
      binding: "translation",
      runtime_binding: {
        adapter: "teleop",
        axis_mapping: { x: { component: "linear_x" }, y: { component: "linear_y" } },
      },
    });

    // The target is the strip's last slot; "translation" still belongs in the
    // mode and axis-summary slots, so only this one must be a topic.
    expect(targetSlot()).toBe("/joystick_cartesian_command");
  });

  it("prefers the binding's explicit target topic when it has one", () => {
    renderJoystick({
      runtime_binding: { adapter: "teleop", value_mapping: { target_topic: "/explorer/twist" } },
    });

    expect(targetSlot()).toBe("/explorer/twist");
  });

  it("never prints the placeholder that stood in for a topic", () => {
    renderJoystick({});

    expect(targetSlot()).not.toBe("input");
    expect(targetSlot()).toMatch(/^\//);
  });
});

describe("the dead zone", () => {
  // The pointer area is square: a corner press reaches magnitude √2 while the pad only ever means 1.
  // Compared raw, a pad drawn completely inert still published a full-scale command from its corners.
  it("makes a pad inert at its maximum, corners included", () => {
    expect(normalizeJoystickVector({ x: 1, y: 1 }, 1)).toEqual({ x: 0, y: 0 });
    expect(normalizeJoystickVector({ x: 0.9, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
  });

  it("clamps a dead zone authored out of range instead of trusting it", () => {
    expect(normalizeJoystickVector({ x: 1, y: 1 }, 1.4)).toEqual({ x: 0, y: 0 });
    expect(normalizeJoystickVector({ x: 0.5, y: 0 }, -1)).toEqual({ x: 0.5, y: 0 });
  });

  it("still passes a real push through at an ordinary dead zone", () => {
    expect(normalizeJoystickVector({ x: 0.1, y: 0 }, 0.2)).toEqual({ x: 0, y: 0 });
    expect(normalizeJoystickVector({ x: 0.5, y: 0 }, 0.2)).toEqual({ x: 0.5, y: 0 });
    const corner = normalizeJoystickVector({ x: 1, y: 1 }, 0.2);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1, 5);
  });
});

class SliderResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

describe("a slider authored with impossible bounds", () => {
  beforeAll(() => {
    globalThis.ResizeObserver = SliderResizeObserverMock as never;
  });

  // Validation refuses min >= max, but the renderer falls back to the raw settings when it does, so the
  // pair still reaches the track. Equal bounds divided by zero and left the thumb unplaceable.
  it("keeps a usable span rather than dividing by zero", () => {
    render(
      <SliderWidget
        descriptor={
          {
            widget: {
              id: "speed",
              kind: "slider",
              title: "Speed",
              layout: { x: 0, y: 0, width: 300, height: 120 },
              settings: { direction: "horizontal", max: 1, min: 1, value: 1 },
            },
          } as never
        }
      />,
    );

    const slider = screen.getByRole("slider");
    const low = Number(slider.getAttribute("aria-valuemin"));
    const high = Number(slider.getAttribute("aria-valuemax"));
    expect(high).toBeGreaterThan(low);
  });
});
