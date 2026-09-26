import type { RuntimeActionPreset, ScreenConfig } from "@bloom/api-client";
import { createWidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it } from "vitest";
import {
  applyRuntimeModeIntent,
  createDefaultRuntimeModeState,
  createRuntimeControlStateByWidgetId,
} from "./runtimeModeState";

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
  it("lights up once its preset was requested", () => {
    const modeState = applyRuntimeModeIntent(
      createDefaultRuntimeModeState(),
      createWidgetActionIntent(widget as never, { type: "press" }),
    );
    const states = createRuntimeControlStateByWidgetId(screen, modeState, { actionPresets: [jaco] });
    expect(states["jaco-button"]?.selection).toBe("selected");
  });

  it("waits for a subscriber on the preset's topic", () => {
    const states = createRuntimeControlStateByWidgetId(screen, createDefaultRuntimeModeState(), {
      actionPresets: [jaco],
      topicStatuses: [{ name: "/mode_request", publisher_count: 0, subscription_count: 0 } as never],
    });
    expect(states["jaco-button"]).toMatchObject({ disabled: true });
    expect(states["jaco-button"]?.disabledReason).toMatch(/\/mode_request/);
  });
});
