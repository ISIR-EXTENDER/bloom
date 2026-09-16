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
      requestedMode: null,
      source: "operator-command",
      updatedAt: "2026-07-10T12:00:00.000Z",
    });
  });

  it("shares mode state with every compatible mode toggle on the active screen", () => {
    expect(
      createRuntimeControlStateByWidgetId(createModeScreen(), {
        mode: "b2",
        requestedMode: null,
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
          name: "/mode_request",
          message_type: "std_msgs/msg/Int32",
          publisher_count: 0,
          subscription_count: 1,
        },
        {
          name: "/joystick_cartesian_command",
          message_type: "extender_msgs/msg/TeleopCommand",
          publisher_count: 1,
          subscription_count: 0,
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: "/mode_request", status: "ready", statusLabel: "Ready" }),
        expect.objectContaining({
          topic: "/joystick_cartesian_command",
          status: "waiting",
          statusLabel: "No subscriber",
        }),
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
      allowed_publish_topics: ["/mode_request"],
      allowed_recording_topics: [],
      allowed_teleop_targets: ["/joystick_cartesian_command"],
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

/**
 * The Drive screen's mode buttons all write `/mode_request`, and they are
 * mutually exclusive in effect: the last one pressed wins. Until now nothing
 * tracked which that was, so every button looked identical whatever the arm
 * had been asked to do.
 *
 * `cartesian_manager` publishes no mode feedback, so this is a record of what
 * was requested from this session, never a confirmation.
 */
describe("cartesian_manager mode requests", () => {
  const modeButton = (id: string, command: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: "command-button" as const,
    title: id,
    layout: { x: 0, y: 0, width: 10, height: 10 },
    settings: {
      command,
      topic: "/mode_request",
      messageType: "std_msgs/msg/String",
      payload: { data: command },
      ...extra,
    },
  });

  const driveScreen = () =>
    ({
      id: "drive",
      title: "Drive",
      widgets: [
        modeButton("drive-mode-both", "geometric/both"),
        modeButton("drive-mode-jaco", "geometric/jaco"),
        modeButton("drive-snake-hold", "geometric/snake", { momentary: true }),
        modeButton("positions-release", "behaviour/passthrough"),
      ],
    }) as never;

  it("records the mode a command intent asks for", () => {
    const next = applyRuntimeModeIntent(createDefaultRuntimeModeState(), {
      type: "command",
      command: "geometric/jaco",
      widgetId: "drive-mode-jaco",
      widgetKind: "command-button",
    } as never);

    expect(next.requestedMode).toBe("geometric/jaco");
  });

  it("records the mode a momentary button publishes directly", () => {
    const next = applyRuntimeModeIntent(createDefaultRuntimeModeState(), {
      type: "topic-publish",
      topic: "/mode_request",
      messageType: "std_msgs/msg/String",
      payload: { data: "geometric/snake" },
      widgetId: "drive-snake-hold",
      widgetKind: "command-button",
    } as never);

    expect(next.requestedMode).toBe("geometric/snake");
  });

  it("normalises the way the manager does, so a button still lights up", () => {
    const next = applyRuntimeModeIntent(createDefaultRuntimeModeState(), {
      type: "command",
      command: "GEOMETRIC/Joint-Target",
      widgetId: "x",
      widgetKind: "command-button",
    } as never);

    expect(next.requestedMode).toBe("geometric/joint_target");
  });

  it("ignores commands that are not mode requests, rather than unlighting the set", () => {
    const withMode = applyRuntimeModeIntent(createDefaultRuntimeModeState(), {
      type: "command",
      command: "geometric/both",
      widgetId: "drive-mode-both",
      widgetKind: "command-button",
    } as never);

    const afterOtherCommand = applyRuntimeModeIntent(withMode, {
      type: "command",
      command: "gripper/open",
      widgetId: "drive-gripper",
      widgetKind: "command-button",
    } as never);

    expect(afterOtherCommand.requestedMode).toBe("geometric/both");
  });

  it("marks exactly one latching button as selected", () => {
    const state = { ...createDefaultRuntimeModeState(), requestedMode: "geometric/jaco" };

    expect(createRuntimeControlStateByWidgetId(driveScreen(), state)).toEqual({
      "drive-mode-both": { selection: "unselected" },
      "drive-mode-jaco": { selection: "selected" },
      "positions-release": { selection: "unselected" },
    });
  });

  it("leaves the momentary button out, since it already shows a held state", () => {
    const state = { ...createDefaultRuntimeModeState(), requestedMode: "geometric/snake" };
    const controlState = createRuntimeControlStateByWidgetId(driveScreen(), state);

    expect(controlState["drive-snake-hold"]).toBeUndefined();
  });

  it("selects nothing before any mode has been requested", () => {
    const controlState = createRuntimeControlStateByWidgetId(driveScreen(), createDefaultRuntimeModeState());

    expect(Object.values(controlState).every((entry) => entry.selection === "unselected")).toBe(true);
  });

  it("does not treat a button on another topic as a mode control", () => {
    const screen = {
      id: "drive",
      title: "Drive",
      widgets: [modeButton("gripper", "open", { topic: "/gripper_controller/commands" })],
    } as never;

    expect(createRuntimeControlStateByWidgetId(screen, createDefaultRuntimeModeState())).toEqual({});
  });
});

describe("runtime command-frame controls", () => {
  const frameScreen = {
    id: "joystick-lab",
    title: "Joystick lab",
    canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    widgets: [
      {
        id: "frame-base",
        kind: "command-button",
        title: "Base",
        layout: { x: 0, y: 0, width: 120, height: 82 },
        settings: { runtime_binding: { adapter: "teleop-frame", frame_id: "base_link" } },
      },
      {
        id: "frame-tool",
        kind: "command-button",
        title: "Tool",
        layout: { x: 120, y: 0, width: 120, height: 82 },
        settings: { runtime_binding: { adapter: "teleop-frame", frame_id: "effector_frame" } },
      },
    ],
  } as ScreenConfig;

  it("selects the active frame and disables frames this robot does not support", () => {
    expect(
      createRuntimeControlStateByWidgetId(frameScreen, createDefaultRuntimeModeState(), {
        activeCommandFrameId: "base_link",
        allowedCommandFrameIds: ["base_link"],
      }),
    ).toEqual({
      "frame-base": { selection: "selected" },
      "frame-tool": {
        disabled: true,
        disabledReason: "Unavailable on this robot.",
        selection: "unselected",
      },
    });
  });

  it("disables every frame change while the composed twist is moving", () => {
    const state = createRuntimeControlStateByWidgetId(frameScreen, createDefaultRuntimeModeState(), {
      activeCommandFrameId: "base_link",
      allowedCommandFrameIds: ["base_link", "effector_frame"],
      teleopActive: true,
    });

    expect(state["frame-base"]).toMatchObject({ disabled: true, disabledReason: "Release controls." });
    expect(state["frame-tool"]).toMatchObject({ disabled: true, disabledReason: "Release controls." });
  });
});

describe("runtime capability gating", () => {
  const capabilityScreen = {
    id: "capabilities",
    title: "Capabilities",
    canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    widgets: [
      {
        id: "translation",
        kind: "joystick",
        title: "Translation",
        layout: { x: 0, y: 0, width: 240, height: 240 },
        settings: {},
      },
      {
        id: "gripper",
        kind: "command-button",
        title: "Gripper",
        layout: { x: 250, y: 0, width: 160, height: 80 },
        settings: {},
      },
      {
        id: "events",
        kind: "event-log",
        title: "Events",
        layout: { x: 420, y: 0, width: 240, height: 180 },
        settings: {},
      },
      {
        id: "heading",
        kind: "label",
        title: "Heading",
        layout: { x: 0, y: 250, width: 180, height: 60 },
        settings: { text: "Always available" },
      },
    ],
  } as ScreenConfig;
  const unavailableCapabilities = [
    {
      id: "teleop-adapter",
      available: false,
      detail: "No teleop gateway is connected, so joystick and axis widgets move nothing.",
    },
    {
      id: "command-dispatcher",
      available: false,
      detail: "No ROS publisher is connected, so commands go nowhere.",
    },
    {
      id: "data-source",
      available: false,
      detail: "No ROS subscriber is connected, so topic widgets receive nothing.",
    },
  ];

  it("keeps every unavailable widget in state with the backend's reason", () => {
    const state = createRuntimeControlStateByWidgetId(capabilityScreen, createDefaultRuntimeModeState(), {
      runtimeCapabilities: unavailableCapabilities,
    });

    expect(state.translation).toEqual({
      disabled: true,
      disabledReason: "No teleop gateway is connected, so joystick and axis widgets move nothing.",
      unavailable: true,
    });
    expect(state.gripper).toMatchObject({ disabled: true, unavailable: true });
    expect(state.events).toMatchObject({ disabled: true, unavailable: true });
    expect(state.heading).toBeUndefined();
  });

  it("does not guess that a widget is unavailable before capabilities are known", () => {
    expect(
      createRuntimeControlStateByWidgetId(capabilityScreen, createDefaultRuntimeModeState(), {
        runtimeCapabilities: null,
      }),
    ).toEqual({});
  });
});
