import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { createRuntimeControlStateByWidgetId, createRuntimeTopicStatusSummaries } from "./runtimeModeState";

describe("runtime mode state", () => {
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
        expect.objectContaining({
          label: "Max linear speed",
          topic: "/robot/max_linear_speed",
          status: "missing",
        }),
      ]),
    );
  });
});

function createSandboxApp(): ApplicationConfig {
  return {
    id: "sandbox-v0",
    name: "Sandbox V0.0",
    description: "",
    action_presets: [],
    runtime_policy: {
      allowed_message_types: ["std_msgs/msg/Int32", "extender_msgs/msg/TeleopCommand"],
      allowed_publish_topics: ["/mode_request", "/robot/max_linear_speed"],
      allowed_recording_topics: [],
      allowed_service_calls: [],
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
    screens: [
      {
        id: "drive",
        title: "Drive",
        canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
        widgets: [
          {
            id: "max-linear-speed",
            kind: "slider",
            title: "Max linear speed",
            layout: { x: 0, y: 0, width: 200, height: 100 },
            settings: { topic: "/robot/max_linear_speed" },
          },
        ],
      },
    ],
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

  it("binds each latching mode button to the manager state it asks for", () => {
    expect(createRuntimeControlStateByWidgetId(driveScreen())).toEqual({
      "drive-mode-both": {
        commandBinding: {
          lit: [{ key: "manager:shaping", value: "geometric/both" }],
          writes: [{ key: "manager:shaping", value: "geometric/both" }],
        },
      },
      "drive-mode-jaco": {
        commandBinding: {
          lit: [{ key: "manager:shaping", value: "geometric/jaco" }],
          writes: [{ key: "manager:shaping", value: "geometric/jaco" }],
        },
      },
      "positions-release": {
        commandBinding: {
          lit: [{ key: "manager:behaviour", value: "behaviour/passthrough" }],
          writes: [{ key: "manager:behaviour", value: "behaviour/passthrough" }],
        },
      },
    });
  });

  it("normalises the way the manager does and binds a joint target as a one-shot", () => {
    const screen = {
      id: "positions",
      title: "Positions",
      widgets: [modeButton("home", "Behaviour/Joint-Target/Home"), modeButton("ready", "behaviour/pose_target/ready")],
    } as never;

    expect(createRuntimeControlStateByWidgetId(screen)).toEqual({
      home: { commandBinding: { writes: [{ key: "manager:target", value: "behaviour/joint_target/home" }] } },
      ready: {
        commandBinding: {
          lit: [
            { key: "manager:behaviour", value: "behaviour/pose_target" },
            { key: "manager:target", value: "behaviour/pose_target/ready" },
          ],
          writes: [
            { key: "manager:behaviour", value: "behaviour/pose_target" },
            { key: "manager:target", value: "behaviour/pose_target/ready" },
          ],
        },
      },
    });
  });

  it("keys a mode button on another mode topic by that topic", () => {
    const screen = {
      id: "drive",
      title: "Drive",
      widgets: [modeButton("arm2", "geometric/snake", { topic: "/arm2/mode_request" })],
    } as never;

    expect(createRuntimeControlStateByWidgetId(screen).arm2?.commandBinding?.writes).toEqual([
      { key: "manager:shaping@/arm2/mode_request", value: "geometric/snake" },
    ]);
  });

  it("leaves the momentary button out, since it shows the operator's hold", () => {
    expect(createRuntimeControlStateByWidgetId(driveScreen())["drive-snake-hold"]).toBeUndefined();
  });

  it("does not treat a button on another topic as a mode control", () => {
    const screen = {
      id: "drive",
      title: "Drive",
      widgets: [modeButton("gripper", "open", { topic: "/gripper_controller/commands" })],
    } as never;

    expect(createRuntimeControlStateByWidgetId(screen)).toEqual({});
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
      createRuntimeControlStateByWidgetId(frameScreen, {
        activeCommandFrameId: "base_link",
        allowedCommandFrameIds: ["base_link"],
      }),
    ).toEqual({
      "frame-base": { selection: "selected" },
      "frame-tool": {
        disabled: true,
        disabledReason: "Unavailable on this robot.",
        selection: "unselected",
        unsupported: true,
      },
    });
  });

  it("hands the active frame to an echo of the stamped twists, and to no other echo", () => {
    const echoes = {
      ...frameScreen,
      widgets: [
        {
          id: "sent",
          kind: "topic-echo",
          title: "Twist",
          layout: { x: 0, y: 0, width: 338, height: 216 },
          settings: { messageType: "geometry_msgs/msg/TwistStamped", topic: "/joystick_cartesian_command" },
        },
        {
          id: "joints",
          kind: "topic-echo",
          title: "Joints",
          layout: { x: 0, y: 220, width: 338, height: 216 },
          settings: { messageType: "sensor_msgs/msg/JointState", topic: "/joint_states" },
        },
      ],
    } as ScreenConfig;

    const state = createRuntimeControlStateByWidgetId(echoes, {
      activeCommandFrameId: "effector_frame",
    });

    expect(state.sent).toEqual({ commandFrameId: "effector_frame" });
    expect(state.joints).toBeUndefined();
  });

  it("keeps saying a frame is unsupported while the twist is moving", () => {
    const state = createRuntimeControlStateByWidgetId(frameScreen, {
      activeCommandFrameId: "base_link",
      allowedCommandFrameIds: ["base_link"],
      teleopActive: true,
    });

    expect(state["frame-base"]).toEqual({ disabled: true, disabledReason: "Release controls.", selection: "selected" });
    expect(state["frame-tool"]).toMatchObject({ disabledReason: "Unavailable on this robot.", unsupported: true });
  });

  it("disables every frame change while the composed twist is moving", () => {
    const state = createRuntimeControlStateByWidgetId(frameScreen, {
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
    const state = createRuntimeControlStateByWidgetId(capabilityScreen, {
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
      createRuntimeControlStateByWidgetId(capabilityScreen, {
        runtimeCapabilities: null,
      }),
    ).toEqual({});
  });
});

describe("runtime ROS subscriber gating", () => {
  const speedScreen = createSandboxApp().screens[0] as ScreenConfig;

  it("keeps a topic control inert while subscriber readiness is unknown", () => {
    const state = createRuntimeControlStateByWidgetId(speedScreen, {
      topicStatuses: null,
    });

    expect(state["max-linear-speed"]).toEqual({
      disabled: true,
      disabledReason:
        "ROS subscriber readiness is unavailable for /robot/max_linear_speed. Wait for the robot connection before using this control.",
      unavailable: true,
    });
  });

  it("disables a topic control when publishing would have no consumer", () => {
    const state = createRuntimeControlStateByWidgetId(speedScreen, {
      topicStatuses: [],
    });

    expect(state["max-linear-speed"]).toEqual({
      disabled: true,
      disabledReason:
        "No ROS node subscribes to /robot/max_linear_speed. Start the robot controller before using this control.",
      unavailable: true,
    });
  });

  it("enables the topic control when its controller is subscribed", () => {
    const state = createRuntimeControlStateByWidgetId(speedScreen, {
      topicStatuses: [
        {
          name: "/robot/max_linear_speed",
          message_type: "std_msgs/msg/Float64",
          publisher_count: 1,
          subscription_count: 1,
        },
      ],
    });

    expect(state["max-linear-speed"]).toBeUndefined();
  });
});

describe("a joystick on a topic the server refuses", () => {
  // Robin, 2026-09-25: added a topic to the app, pointed a joystick at it, got "Command failed" on the first press.
  const joystick = (topic?: string) => ({
    id: "stick",
    kind: "joystick",
    title: "Stick",
    layout: { x: 0, y: 0, width: 200, height: 200 },
    settings: {
      runtime_binding: {
        adapter: "teleop",
        target: "translation",
        ...(topic ? { value_mapping: { target_topic: topic } } : {}),
      },
    },
  });
  const screen = (topic?: string) =>
    ({
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "hd", runtime_mode: "fit" },
      widgets: [joystick(topic)],
    }) as never;
  const reasons = {
    app: (topic: string) => `app refuses ${topic}`,
    server: (topic: string) => `server refuses ${topic}`,
  };
  const states = (topic: string | undefined, app: string[], effective: string[] | null) =>
    createRuntimeControlStateByWidgetId(screen(topic), {
      teleopTargets: { app, effective, reasons },
    });

  it("is unavailable before it is pressed, and says the server is why", () => {
    const state = states(
      "/tablet_cmd",
      ["/joystick_cartesian_command", "/tablet_cmd"],
      ["/joystick_cartesian_command"],
    );
    expect(state.stick).toMatchObject({
      disabled: true,
      unavailable: true,
      disabledReason: "server refuses /tablet_cmd",
    });
  });

  it("says the app is why when the app's own list leaves the topic out", () => {
    const state = states("/tablet_cmd", ["/joystick_cartesian_command"], ["/joystick_cartesian_command"]);
    expect(state.stick?.disabledReason).toBe("app refuses /tablet_cmd");
  });

  it("stays live on an allowed topic, on the manager's input by default, and before the server has answered", () => {
    expect(states("/tablet_cmd", ["/tablet_cmd"], ["/tablet_cmd"]).stick).toBeUndefined();
    expect(states(undefined, ["/joystick_cartesian_command"], ["/joystick_cartesian_command"]).stick).toBeUndefined();
    expect(states("/tablet_cmd", ["/tablet_cmd"], null).stick).toBeUndefined();
    expect(states("/tablet_cmd", ["*"], ["*"]).stick).toBeUndefined();
  });
});
