import type { WidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it } from "vitest";

import { resolveRuntimeIntentRefusal } from "./runtime-intent-gate";

const press: WidgetActionIntent = {
  type: "topic-publish",
  widgetId: "hold-snake",
  widgetKind: "command-button",
  topic: "/mode_request",
  messageType: "std_msgs/msg/String",
  payload: { data: "geometric/snake" },
};
const release: WidgetActionIntent = { ...press, payload: { data: "geometric/both" }, release: true };

describe("runtime intent gate", () => {
  it("refuses every intent from a session that does not own control", () => {
    expect(resolveRuntimeIntentRefusal(press, { ownsControl: false, unavailable: false })).toBe("not-owner");
    expect(resolveRuntimeIntentRefusal(release, { ownsControl: false, unavailable: false })).toBe("not-owner");
  });

  it("refuses a new command from an unavailable control", () => {
    expect(resolveRuntimeIntentRefusal(press, { ownsControl: true, unavailable: true })).toBe("unavailable");
  });

  it("refuses everything but a release while maintenance, settings or the tour holds the robot", () => {
    expect(resolveRuntimeIntentRefusal(press, { held: true, ownsControl: true, unavailable: false })).toBe("held");
    expect(resolveRuntimeIntentRefusal(release, { held: true, ownsControl: true, unavailable: false })).toBeNull();
  });

  it("lets a release through an unavailable control, which is when it matters most", () => {
    expect(resolveRuntimeIntentRefusal(release, { ownsControl: true, unavailable: true })).toBeNull();
  });

  it("treats a teleop control returning to zero as a release", () => {
    const joystick = (x: number, y: number): WidgetActionIntent => ({
      type: "value-change",
      widgetId: "translation",
      widgetKind: "joystick",
      value: { x, y },
    });
    expect(resolveRuntimeIntentRefusal(joystick(0, 0), { ownsControl: true, unavailable: true })).toBeNull();
    expect(resolveRuntimeIntentRefusal(joystick(0.4, 0), { ownsControl: true, unavailable: true })).toBe("unavailable");
  });

  it("refuses everything but a release while the stop latch is on", () => {
    // Arrow keys on a pad that already had focus never meet the canvas'
    // pointer-events: none, and neither does an assistive activation.
    const step: WidgetActionIntent = {
      type: "value-change",
      widgetId: "translation",
      widgetKind: "joystick",
      value: { x: 0, y: 0.5 },
    };
    expect(resolveRuntimeIntentRefusal(step, { ownsControl: true, stopped: true, unavailable: false })).toBe("stopped");
    expect(resolveRuntimeIntentRefusal(press, { ownsControl: true, stopped: true, unavailable: false })).toBe(
      "stopped",
    );
    // A release is how a held control returns to rest, so it still passes.
    expect(
      resolveRuntimeIntentRefusal(
        { ...step, value: { x: 0, y: 0 } },
        { ownsControl: true, stopped: true, unavailable: false },
      ),
    ).toBeNull();
    expect(resolveRuntimeIntentRefusal(release, { ownsControl: true, stopped: true, unavailable: false })).toBeNull();
  });

  it("lets an owner's command through an available control", () => {
    expect(resolveRuntimeIntentRefusal(press, { ownsControl: true, unavailable: false })).toBeNull();
  });
});
