import type { WidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it, vi } from "vitest";
import {
  createRosTopicPublishRequest,
  createScalarTopicPublishRequest,
  createTeleopCommandRequest,
  createValueTopicPublishRequest,
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
} from "./runtime-action-dispatcher";
import { TeleopTwistComposer } from "./teleop-composition";

describe("runtime action dispatcher", () => {
  it("changes the session frame only at zero and stamps the next twist with it", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request) => ({
        type: "teleop_ack" as const,
        detail: "Accepted.",
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
      })),
    };
    const composer = new TeleopTwistComposer();
    let activeFrame = "base_link";
    const frameIntent = createTeleopFrameIntent("effector_frame");
    const frameOptions = {
      allowedCommandFrameIds: ["base_link", "effector_frame"],
      onCommandFrameChange: (frameId: string) => {
        activeFrame = frameId;
      },
      teleopComposer: composer,
    };

    composer.contribute("translation", { linear_x: 0.5 });
    await expect(dispatchRuntimeActionIntent(client, frameIntent, frameOptions)).resolves.toMatchObject({
      status: "blocked",
      detail: "Release every motion control before changing the command frame.",
    });
    expect(activeFrame).toBe("base_link");

    composer.contribute("translation", { linear_x: 0 });
    await expect(dispatchRuntimeActionIntent(client, frameIntent, frameOptions)).resolves.toMatchObject({
      status: "accepted",
    });
    expect(activeFrame).toBe("effector_frame");

    const movement = createTeleopValueIntent({
      runtimeBinding: {
        adapter: "teleop",
        value_mapping: { target_topic: "/joystick_cartesian_command" },
      },
      value: { x: 0.25, y: 0 },
    });
    await expect(
      dispatchRuntimeActionIntent(client, movement, {
        teleopComposer: composer,
        runtimePolicy: {
          command_frame_id: activeFrame,
          allowed_message_types: [],
          allowed_publish_topics: [],
          allowed_recording_topics: [],
          allowed_service_calls: [],
          allowed_teleop_targets: ["/joystick_cartesian_command"],
        },
      }),
    ).resolves.toMatchObject({ request: { frame_id: "effector_frame" }, status: "accepted" });
  });

  it("blocks a frame absent from the backend capability report", async () => {
    const onCommandFrameChange = vi.fn();
    await expect(
      dispatchRuntimeActionIntent({ publishRosTopic: vi.fn() }, createTeleopFrameIntent("ft_frame"), {
        allowedCommandFrameIds: ["base_link", "effector_frame"],
        onCommandFrameChange,
        teleopComposer: new TeleopTwistComposer(),
      }),
    ).resolves.toMatchObject({ status: "blocked", detail: 'Command frame "ft_frame" is not available on this robot.' });
    expect(onCommandFrameChange).not.toHaveBeenCalled();
  });

  it("converts CLI-style topic payloads to backend payload_text requests", () => {
    const intent = createTopicPublishIntent("{data: [13, 1]}");

    expect(createRosTopicPublishRequest(intent)).toEqual({
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/Int32MultiArray",
      payload_text: "{data: [13, 1]}",
    });
  });

  it("keeps object topic payloads as structured backend payloads", () => {
    const intent = createTopicPublishIntent({ data: "activate_throw" }, "std_msgs/msg/String");

    expect(createRosTopicPublishRequest(intent)).toEqual({
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/String",
      payload: { data: "activate_throw" },
    });
  });

  it("wraps scalar topic payloads in a std_msgs-like data field", () => {
    const intent = createTopicPublishIntent(true, "std_msgs/msg/Bool");

    expect(createRosTopicPublishRequest(intent)).toEqual({
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/Bool",
      payload: { data: true },
    });
  });

  it("dispatches topic publish intents through the runtime client", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(
        async (request) =>
          ({
            topic: request.topic,
            message_type: request.message_type,
            status: "simulated",
            detail: "ROS publisher gateway is not configured.",
          }) as const,
      ),
    };
    const intent = createTopicPublishIntent("{data: [13, 1]}");

    await expect(dispatchRuntimeActionIntent(client, intent)).resolves.toMatchObject({
      status: "simulated",
      detail: "ROS publisher gateway is not configured.",
      request: {
        topic: "/ui/ros_toggle",
        message_type: "std_msgs/msg/Int32MultiArray",
        payload_text: "{data: [13, 1]}",
      },
    });
    expect(client.publishRosTopic).toHaveBeenCalledOnce();
  });

  it("blocks topic publish intents outside the active app runtime policy", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
    };
    const intent = createTopicPublishIntent("{data: [13, 1]}");

    await expect(
      dispatchRuntimeActionIntent(client, intent, {
        runtimePolicy: {
          allowed_message_types: ["std_msgs/msg/Int32MultiArray"],
          allowed_publish_topics: ["/safe/topic"],
          allowed_recording_topics: [],
          allowed_service_calls: [],
          allowed_teleop_targets: [],
        },
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      detail: 'ROS topic "/ui/ros_toggle" is not allowed by this app runtime policy.',
      request: {
        topic: "/ui/ros_toggle",
        message_type: "std_msgs/msg/Int32MultiArray",
      },
    });
    expect(client.publishRosTopic).not.toHaveBeenCalled();
  });

  it("dispatches configured command presets through the runtime client", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(
        async (request) =>
          ({
            topic: request.topic,
            message_type: request.message_type,
            status: "published",
            detail: "Command preset published.",
          }) as const,
      ),
    };
    const intent = createCommandIntent("emergency_stop", "emergency-stop");

    await expect(
      dispatchRuntimeActionIntent(client, intent, {
        actionPresets: [
          {
            id: "emergency-stop",
            name: "Emergency stop",
            kind: "topic-publish",
            description: "",
            command: "emergency_stop",
            topic: "/explorer/emergency_stop",
            message_type: "std_msgs/msg/Bool",
            payload: null,
            payload_text: "{data: true}",
            tags: ["safety"],
          },
        ],
        runtimePolicy: {
          allowed_message_types: ["std_msgs/msg/Bool"],
          allowed_publish_topics: ["/explorer/emergency_stop"],
          allowed_recording_topics: [],
          allowed_service_calls: [],
          allowed_teleop_targets: [],
        },
      }),
    ).resolves.toMatchObject({
      status: "published",
      detail: "Command preset published.",
      request: {
        topic: "/explorer/emergency_stop",
        message_type: "std_msgs/msg/Bool",
        payload_text: "{data: true}",
      },
    });
    expect(client.publishRosTopic).toHaveBeenCalledOnce();
  });

  it("dispatches configured command presets through the app-scoped backend action endpoint", async () => {
    const client: RuntimeActionClient = {
      dispatchRuntimeAction: vi.fn(async (request) => ({
        app_id: request.app_id,
        command: request.command ?? "",
        config_id: request.config_id,
        detail: "Published /ui/robot_action.",
        message_type: "std_msgs/msg/String",
        preset_id: request.preset_id ?? "",
        status: "published" as const,
        topic: "/ui/robot_action",
      })),
      publishRosTopic: vi.fn(),
    };

    await expect(
      dispatchRuntimeActionIntent(client, createCommandIntent("explorer.deploy"), {
        actionPresets: [
          {
            id: "explorer-deploy",
            name: "Deploy robot",
            kind: "topic-publish",
            description: "",
            command: "explorer.deploy",
            topic: "/ui/robot_action",
            message_type: "std_msgs/msg/String",
            payload: null,
            payload_text: "{data: 'deploy'}",
            tags: ["explorer"],
          },
        ],
        appId: "explorer-user-tests",
        configId: "explorer-user-tests",
        runtimePolicy: {
          allowed_message_types: ["std_msgs/msg/String"],
          allowed_publish_topics: ["/ui/robot_action"],
          allowed_recording_topics: [],
          allowed_service_calls: [],
          allowed_teleop_targets: [],
        },
      }),
    ).resolves.toMatchObject({
      status: "published",
      detail: "Published /ui/robot_action.",
      request: {
        app_id: "explorer-user-tests",
        command: "explorer.deploy",
        config_id: "explorer-user-tests",
        preset_id: "explorer-deploy",
        type: "runtime_action",
      },
    });
    expect(client.dispatchRuntimeAction).toHaveBeenCalledWith({
      app_id: "explorer-user-tests",
      command: "explorer.deploy",
      config_id: "explorer-user-tests",
      preset_id: "explorer-deploy",
    });
    expect(client.publishRosTopic).not.toHaveBeenCalled();
  });

  it("dispatches saved-position command presets through the same generic publish contract", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(
        async (request) =>
          ({
            topic: request.topic,
            message_type: request.message_type,
            status: "published",
            detail: "Saved preset command published.",
          }) as const,
      ),
    };

    await expect(
      dispatchRuntimeActionIntent(client, createCommandIntent("saved_position.replay_selected"), {
        actionPresets: [
          {
            id: "saved-position-replay-selected",
            name: "Replay saved position",
            kind: "topic-publish",
            description: "",
            command: "saved_position.replay_selected",
            topic: "/explorer/saved_position/command",
            message_type: "std_msgs/msg/String",
            payload: null,
            payload_text: "{data: 'replay_selected'}",
            tags: ["saved-preset", "library"],
          },
        ],
        runtimePolicy: {
          allowed_message_types: ["std_msgs/msg/String"],
          allowed_publish_topics: ["/explorer/saved_position/command"],
          allowed_recording_topics: [],
          allowed_service_calls: [],
          allowed_teleop_targets: [],
        },
      }),
    ).resolves.toMatchObject({
      status: "published",
      detail: "Saved preset command published.",
      request: {
        topic: "/explorer/saved_position/command",
        message_type: "std_msgs/msg/String",
        payload_text: "{data: 'replay_selected'}",
      },
    });
    expect(client.publishRosTopic).toHaveBeenCalledOnce();
  });

  it("returns unsupported results when topic publish intents miss the message type", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
    };
    const intent = {
      ...createTopicPublishIntent("{data: [13, 1]}"),
      messageType: undefined,
    };

    await expect(dispatchRuntimeActionIntent(client, intent)).resolves.toMatchObject({
      status: "unsupported",
      detail: "Topic publish intents need a ROS message type before they can be sent.",
    });
    expect(client.publishRosTopic).not.toHaveBeenCalled();
  });

  it("converts joystick value-change intents to teleop commands", () => {
    const intent = createTeleopValueIntent({
      modeId: "translation",
      runtimeBinding: {
        adapter: "teleop",
        value_mapping: {
          target_topic: "/joystick_cartesian_command",
        },
      },
      value: { x: 0.25, y: -0.5 },
    });

    expect(createTeleopCommandRequest(intent, 7)).toEqual({
      type: "teleop_cmd",
      angular: { x: 0, y: 0, z: 0 },
      linear: { x: 0.25, y: -0.5, z: 0 },
      mode: 2,
      seq: 7,
      target: "/joystick_cartesian_command",
    });
  });

  it("carries a bound rotation frame into the teleop command", () => {
    const intent = createTeleopValueIntent({
      modeId: "rotation",
      runtimeBinding: {
        adapter: "teleop",
        value_mapping: {
          frame_id: "ft_frame",
          target_topic: "/joystick_cartesian_command",
        },
      },
      value: { x: 0.25, y: 0 },
    });

    expect(createTeleopCommandRequest(intent, 3)).toMatchObject({
      type: "teleop_cmd",
      frame_id: "ft_frame",
      target: "/joystick_cartesian_command",
    });
  });

  it("uses one app frame for every axis even when a widget carries an older frame", () => {
    const intent = createTeleopValueIntent({
      modeId: "rotation",
      runtimeBinding: {
        adapter: "teleop",
        value_mapping: {
          frame_id: "ft_frame",
          target_topic: "/joystick_cartesian_command",
        },
      },
      value: { x: 0.25, y: 0 },
    });

    expect(createTeleopCommandRequest(intent, 3, undefined, "hybrid_frame")).toMatchObject({
      frame_id: "hybrid_frame",
    });
  });

  it("omits frame_id entirely when no frame is bound, keeping the backend default", () => {
    const intent = createTeleopValueIntent({
      modeId: "translation",
      runtimeBinding: {
        adapter: "teleop",
        value_mapping: { target_topic: "/joystick_cartesian_command" },
      },
      value: { x: 0.25, y: 0 },
    });

    expect(createTeleopCommandRequest(intent, 3)).not.toHaveProperty("frame_id");
  });

  it("keeps Explorer teleop mode overrides in app configuration", () => {
    const intent = createTeleopValueIntent({
      modeId: "both",
      runtimeBinding: {
        adapter: "teleop",
        value_mapping: {
          mode: 3,
          target_topic: "/custom_teleop",
        },
      },
      value: { x: 0.4, y: 0.8 },
    });

    expect(createTeleopCommandRequest(intent)).toMatchObject({
      linear: { x: 0.4, y: 0.8, z: 0 },
      mode: 3,
      target: "/custom_teleop",
    });
  });

  it("keeps teleop joystick vectors normalized to the legacy unit disk contract", () => {
    const intent = createTeleopValueIntent({
      modeId: "translation",
      runtimeBinding: {
        adapter: "teleop",
      },
      value: { x: 3, y: 4 },
    });

    expect(createTeleopCommandRequest(intent)).toMatchObject({
      linear: { x: 0.6, y: 0.8, z: 0 },
      mode: 2,
    });
  });

  it("maps rotation joystick modes to angular teleop vectors", () => {
    const intent = createTeleopValueIntent({
      modeId: "rotation",
      runtimeBinding: {
        adapter: "teleop",
      },
      value: { x: -0.1, y: 0.4 },
    });

    expect(createTeleopCommandRequest(intent)).toMatchObject({
      angular: { x: -0.1, y: 0.4, z: 0 },
      linear: { x: 0, y: 0, z: 0 },
      mode: 1,
    });
  });

  it("dispatches teleop commands through the runtime client", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request) => ({
        type: "teleop_ack" as const,
        detail: "Teleop command accepted.",
        payload: {
          angular: request.angular,
          frame_id: request.frame_id ?? "",
          linear: request.linear,
          mode: request.mode,
          seq: request.seq,
          status: "accepted" as const,
          target: request.target,
        },
      })),
    };
    const intent = createTeleopValueIntent({
      modeId: "translation",
      runtimeBinding: {
        adapter: "teleop",
      },
      value: { x: 0.2, y: 0.3 },
    });

    await expect(dispatchRuntimeActionIntent(client, intent, { teleopSequence: 42 })).resolves.toMatchObject({
      status: "accepted",
      detail: "Teleop command accepted.",
      request: {
        type: "teleop_cmd",
        linear: { x: 0.2, y: 0.3, z: 0 },
        mode: 2,
        seq: 42,
        target: "/joystick_cartesian_command",
      },
    });
    expect(client.sendTeleopCommand).toHaveBeenCalledOnce();
    expect(client.publishRosTopic).not.toHaveBeenCalled();
  });

  it("routes teleop through the aggregate sender when one is provided", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(),
    };
    const teleopCommandSender = vi.fn(async () => ({
      detail: "Teleop update was coalesced into a newer command.",
      status: "coalesced" as const,
    }));
    const intent = createTeleopValueIntent({
      modeId: "translation",
      runtimeBinding: { adapter: "teleop" },
      value: { x: 0.2, y: 0.3 },
    });

    await expect(
      dispatchRuntimeActionIntent(client, intent, { teleopCommandSender, teleopSequence: 42 }),
    ).resolves.toMatchObject({
      status: "coalesced",
      detail: "Teleop update was coalesced into a newer command.",
    });
    expect(teleopCommandSender).toHaveBeenCalledOnce();
    expect(client.sendTeleopCommand).not.toHaveBeenCalled();
  });

  it("blocks teleop commands outside the active app runtime policy", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(),
    };
    const intent = createTeleopValueIntent({
      modeId: "translation",
      runtimeBinding: {
        adapter: "teleop",
      },
      value: { x: 0.2, y: 0.3 },
    });

    await expect(
      dispatchRuntimeActionIntent(client, intent, {
        runtimePolicy: {
          allowed_message_types: [],
          allowed_publish_topics: [],
          allowed_recording_topics: [],
          allowed_service_calls: [],
          allowed_teleop_targets: ["/safe_teleop"],
        },
        teleopSequence: 43,
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      detail: 'Teleop target "/joystick_cartesian_command" is not allowed by this app runtime policy.',
      request: {
        target: "/joystick_cartesian_command",
        type: "teleop_cmd",
      },
    });
    expect(client.sendTeleopCommand).not.toHaveBeenCalled();
  });

  it("converts scalar value-change intents to topic publish requests", () => {
    expect(
      createScalarTopicPublishRequest(
        createScalarValueIntent({
          topic: "/cmd/max_velocity",
          value: 1.2,
        }),
      ),
    ).toEqual({
      topic: "/cmd/max_velocity",
      message_type: "std_msgs/msg/Float64",
      payload: { data: 1.2 },
    });
  });

  it("keeps scalar topic payload mapping in app configuration", () => {
    expect(
      createScalarTopicPublishRequest(
        createScalarValueIntent({
          runtimeBinding: {
            adapter: "topic",
            target: "/cmd/custom_velocity",
            value_mapping: {
              field_path: "twist.linear.x",
              message_type: "geometry_msgs/msg/Twist",
            },
          },
          value: 0.4,
        }),
      ),
    ).toEqual({
      topic: "/cmd/custom_velocity",
      message_type: "geometry_msgs/msg/Twist",
      payload: { twist: { linear: { x: 0.4 } } },
    });
  });

  it("dispatches scalar topic bindings through the runtime client", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(
        async (request) =>
          ({
            topic: request.topic,
            message_type: request.message_type,
            status: "published",
            detail: "Published.",
          }) as const,
      ),
    };

    await expect(
      dispatchRuntimeActionIntent(
        client,
        createScalarValueIntent({
          messageType: "std_msgs/msg/Float64",
          topic: "/cmd/max_velocity",
          value: 2.5,
        }),
      ),
    ).resolves.toMatchObject({
      status: "published",
      request: {
        topic: "/cmd/max_velocity",
        message_type: "std_msgs/msg/Float64",
        payload: { data: 2.5 },
      },
    });
    expect(client.publishRosTopic).toHaveBeenCalledOnce();
  });

  it("dispatches gesture topic bindings through the runtime client", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(
        async (request) =>
          ({
            topic: request.topic,
            message_type: request.message_type,
            status: "published",
            detail: "Published.",
          }) as const,
      ),
    };

    await expect(
      dispatchRuntimeActionIntent(
        client,
        createGestureValueIntent({
          messageType: "std_msgs/msg/String",
          topic: "/petanque/throw/gesture",
          value: { angleDegrees: 42, power: 0.7 },
        }),
        {
          runtimePolicy: {
            allowed_message_types: ["std_msgs/msg/String"],
            allowed_publish_topics: ["/petanque/throw/gesture"],
            allowed_recording_topics: [],
            allowed_service_calls: [],
            allowed_teleop_targets: [],
          },
        },
      ),
    ).resolves.toMatchObject({
      status: "published",
      request: {
        topic: "/petanque/throw/gesture",
        message_type: "std_msgs/msg/String",
        payload: { data: '{"angleDegrees":42,"power":0.7}' },
      },
    });
    expect(client.publishRosTopic).toHaveBeenCalledOnce();
  });

  it("maps vector topic bindings to Vector3 payloads when configured", () => {
    expect(
      createValueTopicPublishRequest(
        createVectorValueIntent({
          messageType: "geometry_msgs/msg/Vector3",
          topic: "/debug/vector",
          value: { x: 0.3, y: -0.2 },
        }),
      ),
    ).toEqual({
      topic: "/debug/vector",
      message_type: "geometry_msgs/msg/Vector3",
      payload: { x: 0.3, y: -0.2, z: 0 },
    });
  });

  it("keeps non-teleop value-change intents unsupported", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
    };
    const intent = createTeleopValueIntent({
      runtimeBinding: {
        adapter: "local-state",
      },
      value: { x: 0.2, y: 0.3 },
    });

    await expect(dispatchRuntimeActionIntent(client, intent)).resolves.toMatchObject({
      status: "unsupported",
      detail: "Value-change intents need a teleop or topic runtime binding before they can be sent.",
    });
  });
});

function createTopicPublishIntent(
  payload: unknown,
  messageType = "std_msgs/msg/Int32MultiArray",
): Extract<WidgetActionIntent, { type: "topic-publish" }> {
  return {
    type: "topic-publish",
    widgetId: "ros-toggle",
    widgetKind: "toggle",
    topic: "/ui/ros_toggle",
    messageType,
    nextState: "on",
    payload,
    payloadText: typeof payload === "string" ? payload : undefined,
  };
}

function createCommandIntent(command: string, presetId?: string): Extract<WidgetActionIntent, { type: "command" }> {
  return {
    type: "command",
    widgetId: "command",
    widgetKind: "command-button",
    command,
    presetId,
  };
}

function createTeleopFrameIntent(frameId: string): Extract<WidgetActionIntent, { type: "command" }> {
  return {
    type: "command",
    widgetId: `frame-${frameId}`,
    widgetKind: "command-button",
    command: "set-teleop-frame",
    runtimeBinding: { adapter: "teleop-frame", frame_id: frameId },
  };
}

describe("a refused teleop command", () => {
  // The request is composed before it is judged, so a refusal has to undo the contribution. Otherwise a
  // stick bound to a target the deployment forbids keeps its last push in the sum, and the next command
  // from an allowed stick carries an axis the operator let go of.
  it("stops contributing to the commands that follow it", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request) => ({
        type: "teleop_ack" as const,
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
      })),
    };
    const composer = new TeleopTwistComposer();
    const policy = {
      command_frame_id: "base_link",
      allowed_message_types: [],
      allowed_publish_topics: [],
      allowed_recording_topics: [],
      allowed_service_calls: [],
      allowed_teleop_targets: ["/joystick_cartesian_command"],
    };

    const refused = {
      ...createTeleopValueIntent({
        runtimeBinding: { adapter: "teleop", value_mapping: { target_topic: "/teleop_cmd" } },
        value: { x: 1, y: 0 },
      }),
      widgetId: "legacy-stick",
    };
    await expect(
      dispatchRuntimeActionIntent(client, refused, { teleopComposer: composer, runtimePolicy: policy }),
    ).resolves.toMatchObject({ status: "blocked" });

    const allowed = createTeleopValueIntent({
      runtimeBinding: { adapter: "teleop", value_mapping: { target_topic: "/joystick_cartesian_command" } },
      value: { x: 0, y: 0.5 },
    });
    const result = await dispatchRuntimeActionIntent(client, allowed, {
      teleopComposer: composer,
      runtimePolicy: policy,
    });

    expect(result.status).toBe("accepted");
    expect(result.request).toMatchObject({ linear: { x: 0 } });
  });
});

function createTeleopValueIntent(options: {
  modeId?: string;
  runtimeBinding?: unknown;
  value: { x: number; y: number };
}): Extract<WidgetActionIntent, { type: "value-change" }> {
  return {
    type: "value-change",
    widgetId: "joystick",
    widgetKind: "joystick",
    binding: "joy",
    modeId: options.modeId,
    publishRateHz: 30,
    runtimeBinding: options.runtimeBinding,
    value: options.value,
    zeroOnRelease: true,
  };
}

function createScalarValueIntent(options: {
  messageType?: string;
  runtimeBinding?: unknown;
  topic?: string;
  value: number;
}): Extract<WidgetActionIntent, { type: "value-change" }> {
  return {
    type: "value-change",
    widgetId: "slider",
    widgetKind: "slider",
    messageType: options.messageType,
    runtimeBinding: options.runtimeBinding,
    topic: options.topic,
    value: options.value,
  };
}

function createGestureValueIntent(options: {
  messageType?: string;
  topic?: string;
  value: { angleDegrees: number; power: number };
}): Extract<WidgetActionIntent, { type: "value-change" }> {
  return {
    type: "value-change",
    widgetId: "gesture",
    widgetKind: "gesture-pad",
    binding: "petanque.throw.preview",
    messageType: options.messageType,
    topic: options.topic,
    value: options.value,
  };
}

function createVectorValueIntent(options: {
  messageType?: string;
  topic?: string;
  value: { x: number; y: number };
}): Extract<WidgetActionIntent, { type: "value-change" }> {
  return {
    type: "value-change",
    widgetId: "vector",
    widgetKind: "gesture-pad",
    messageType: options.messageType,
    topic: options.topic,
    value: options.value,
  };
}
