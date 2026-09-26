import type { WidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it } from "vitest";

import { createTeleopCommandRequest } from "./dispatch-teleop";
import { TeleopTwistComposer } from "./teleop-composition";

function pad(widgetId: string, target: string, modeId: string, value: { x: number; y: number }) {
  return {
    type: "value-change",
    binding: "joy",
    modeId,
    publishRateHz: 30,
    runtimeBinding: { adapter: "teleop", value_mapping: { target_topic: target } },
    value,
    widgetId,
    widgetKind: "joystick",
    zeroOnRelease: true,
  } as Extract<WidgetActionIntent, { type: "value-change" }>;
}

describe("a composed teleop request", () => {
  it("carries only its own target's pads", () => {
    const composer = new TeleopTwistComposer();
    const first = createTeleopCommandRequest(
      pad("pad-a", "/joystick_cartesian_command", "translation", { x: 0.6, y: 0 }),
      1,
      composer,
    );
    const second = createTeleopCommandRequest(
      pad("pad-b", "/visual_servoing_command", "translation", { x: 0, y: 0.4 }),
      2,
      composer,
    );

    expect(first).toMatchObject({ linear: { x: 0.6, y: 0 }, target: "/joystick_cartesian_command" });
    expect(second).toMatchObject({ linear: { x: 0, y: 0.4 }, target: "/visual_servoing_command" });
  });

  it("asks the legacy controller for BOTH while translation and rotation are held, then for what is left", () => {
    const composer = new TeleopTwistComposer();
    createTeleopCommandRequest(pad("move", "/teleop_cmd", "translation", { x: 0.5, y: 0 }), 1, composer);
    const both = createTeleopCommandRequest(pad("turn", "/teleop_cmd", "rotation", { x: 0.3, y: 0 }), 2, composer);
    const turnOnly = createTeleopCommandRequest(pad("move", "/teleop_cmd", "translation", { x: 0, y: 0 }), 3, composer);

    expect(both).toMatchObject({ mode: 3, linear: { x: 0.5 }, angular: { x: 0.3 } });
    expect(turnOnly).toMatchObject({ mode: 1, linear: { x: 0 }, angular: { x: 0.3 } });
  });
});
