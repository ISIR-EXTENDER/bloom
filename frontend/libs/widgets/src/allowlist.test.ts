import type { WidgetConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { allowlistAllows } from "./allowlist";
import { createWidgetActionIntent } from "./runtime";
import { resolvePublishedMessageType } from "./widget-destination";

describe("allowlistAllows", () => {
  it("grants *, an exact entry, or a namespace ending in /, as the backend does", () => {
    expect(allowlistAllows(["*"], "/x")).toBe(true);
    expect(allowlistAllows(["/x"], "/x")).toBe(true);
    expect(allowlistAllows(["/ui/"], "/ui/gesture")).toBe(true);
    expect(allowlistAllows(["/ui/"], "/uix")).toBe(false);
    expect(allowlistAllows(["/"], "/x")).toBe(false);
    expect(allowlistAllows([], "/x")).toBe(false);
  });
});

const button = (settings: Record<string, unknown>) =>
  ({
    id: "b",
    kind: "command-button",
    layout: { height: 1, width: 1, x: 0, y: 0 },
    settings,
    title: "B",
  }) as unknown as WidgetConfig;

describe("a command button with a preset", () => {
  // The topic was sent whenever it was set, so a picked preset never reached the dispatcher.
  it("asks for the preset first and keeps its own topic as the fallback", () => {
    const intent = createWidgetActionIntent(
      button({
        command: "geometric/both",
        messageType: "std_msgs/msg/String",
        payload: { data: "geometric/both" },
        presetId: "release",
        topic: "/mode_request",
      }),
      { type: "press" },
    );
    expect(intent).toMatchObject({
      fallback: { payload: { data: "geometric/both" }, topic: "/mode_request", type: "topic-publish" },
      presetId: "release",
      type: "command",
    });
  });

  it("still publishes a plain topic when no preset is named", () => {
    expect(
      createWidgetActionIntent(button({ messageType: "std_msgs/msg/String", topic: "/mode_request" }), {
        type: "press",
      }).type,
    ).toBe("topic-publish");
  });
});

describe("resolvePublishedMessageType", () => {
  it("reads the type a plain publish sends, and none for teleop or parameters", () => {
    expect(resolvePublishedMessageType("slider", { topic: "/x" })).toBe("std_msgs/msg/Float64");
    expect(resolvePublishedMessageType("toggle", { messageType: "std_msgs/msg/Bool", topic: "/x" })).toBe(
      "std_msgs/msg/Bool",
    );
    expect(
      resolvePublishedMessageType("slider", {
        runtime_binding: { adapter: "topic", value_mapping: { message_type: "std_msgs/msg/Int32", topic: "/x" } },
      }),
    ).toBe("std_msgs/msg/Int32");
    expect(resolvePublishedMessageType("slider", { runtime_binding: { adapter: "teleop" } })).toBeNull();
    expect(resolvePublishedMessageType("slider", { runtime_binding: { adapter: "parameter" } })).toBeNull();
  });
});
