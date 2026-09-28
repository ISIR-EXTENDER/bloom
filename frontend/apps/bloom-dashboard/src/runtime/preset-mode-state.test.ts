import type { RuntimeActionPreset, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { createRuntimeControlStateByWidgetId } from "./runtimeModeState";

const jaco: RuntimeActionPreset = {
  command: "geometric/jaco",
  description: "",
  id: "jaco",
  kind: "topic-publish",
  message_type: "std_msgs/msg/String",
  name: "Jaco",
  payload: { data: "geometric/jaco" },
  payload_text: "",
  tags: [],
  topic: "/mode_request",
};
const widget = {
  id: "jaco-button",
  kind: "command-button",
  layout: { height: 100, width: 200, x: 0, y: 0 },
  settings: { command: "geometric/jaco", presetId: "jaco" },
  title: "Jaco",
};
const screen = { id: "drive", widgets: [widget] } as unknown as ScreenConfig;

describe("a mode button driven by a preset", () => {
  it("reads the shaping mode its preset asks for", () => {
    const states = createRuntimeControlStateByWidgetId(screen, { actionPresets: [jaco] });
    expect(states["jaco-button"]?.commandBinding?.lit).toEqual([{ key: "manager:shaping", value: "geometric/jaco" }]);
  });

  it("waits for a subscriber on the preset's topic", () => {
    const states = createRuntimeControlStateByWidgetId(screen, {
      actionPresets: [jaco],
      topicStatuses: [{ name: "/mode_request", publisher_count: 0, subscription_count: 0 } as never],
    });
    expect(states["jaco-button"]).toMatchObject({ disabled: true });
    expect(states["jaco-button"]?.disabledReason).toMatch(/\/mode_request/);
  });
});
