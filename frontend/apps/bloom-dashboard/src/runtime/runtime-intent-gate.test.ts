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

  it("lets an owner's command through an available control", () => {
    expect(resolveRuntimeIntentRefusal(press, { ownsControl: true, unavailable: false })).toBeNull();
  });
});
