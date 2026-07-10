import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import {
  applyRuntimeModeIntent,
  createDefaultRuntimeModeState,
  createRuntimeControlStateByWidgetId,
  createRuntimeTopicStatusSummaries,
} from "./runtimeModeState";

describe("runtime mode state", () => {
  it("tracks B1/B2 commands from mode topic publishes", () => {
    const modeState = createDefaultRuntimeModeState();

    const nextModeState = applyRuntimeModeIntent(
      modeState,
      {
        type: "topic-publish",
        widgetId: "mode-toggle",
        widgetKind: "toggle",
        topic: "/cmd/mode",
        messageType: "std_msgs/msg/Int32",
        nextState: "on",
        payload: { data: 3 },
      },
      new Date("2026-07-10T12:00:00.000Z"),
    );

    expect(nextModeState).toEqual({
      mode: "b2",
      source: "operator-command",
      updatedAt: "2026-07-10T12:00:00.000Z",
    });
  });

  it("shares mode state with every compatible mode toggle on the active screen", () => {
    expect(
      createRuntimeControlStateByWidgetId(createModeScreen(), {
        mode: "b2",
        source: "operator-command",
        updatedAt: "",
      }),
    ).toEqual({
      "mode-a": { toggleState: "on" },
      "mode-b": { toggleState: "on" },
    });
  });

  it("summarizes configured runtime topic diagnostics", () => {
    expect(
      createRuntimeTopicStatusSummaries(createSandboxApp(), [
        {
          name: "/cmd/mode",
          message_type: "std_msgs/msg/Int32",
          publisher_count: 0,
          subscription_count: 1,
        },
        {
          name: "/teleop_cmd",
          message_type: "extender_msgs/msg/TeleopCommand",
          publisher_count: 1,
          subscription_count: 0,
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: "/cmd/mode", status: "ready", statusLabel: "Ready" }),
        expect.objectContaining({ topic: "/teleop_cmd", status: "waiting", statusLabel: "No subscriber" }),
      ]),
    );
  });
});

function createModeScreen(): ScreenConfig {
  return {
    id: "mode-screen",
    title: "Mode screen",
    canvas: { preset_id: "hd", runtime_mode: "fit" },
    widgets: [
      createModeToggle("mode-a"),
      createModeToggle("mode-b"),
      {
        id: "other-toggle",
        title: "Other toggle",
        kind: "toggle",
        layout: { x: 0, y: 0, width: 100, height: 80 },
        settings: {
          initialValue: false,
          offPayload: { data: false },
          onPayload: { data: true },
          topic: "/other/topic",
        },
      },
    ],
  };
}

function createModeToggle(id: string): ScreenConfig["widgets"][number] {
  return {
    id,
    title: "Mode B1/B2",
    kind: "toggle",
    layout: { x: 0, y: 0, width: 100, height: 80 },
    settings: {
      initialValue: false,
      offPayload: { data: 0 },
      onPayload: { data: 3 },
      topic: "/cmd/mode",
    },
  };
}

function createSandboxApp(): ApplicationConfig {
  return {
    id: "sandbox-v0",
    name: "Sandbox V0.0",
    description: "",
    action_presets: [],
    runtime_policy: {
      allowed_message_types: ["std_msgs/msg/Int32", "extender_msgs/msg/TeleopCommand"],
      allowed_publish_topics: ["/cmd/mode"],
      allowed_recording_topics: [],
      allowed_teleop_targets: ["/teleop_cmd"],
    },
    theme: {
      inspiration: { moodboard_image_uri: "", reference_url: "" },
      palette: {
        accent: "#0ea5e9",
        background: "#f8fafc",
        primary: "#1d4ed8",
        surface: "#ffffff",
      },
      preset_id: "extender-ui",
    },
    profiles: [],
    screens: [],
  };
}
