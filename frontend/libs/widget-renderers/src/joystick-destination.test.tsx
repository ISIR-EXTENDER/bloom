/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { JoystickWidget } from "./control-renderers";

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
