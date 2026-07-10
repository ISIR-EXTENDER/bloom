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

describe("runtime action dispatcher", () => {
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
          target_topic: "/teleop_cmd",
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
      target: "/teleop_cmd",
    });
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
        target: "/teleop_cmd",
      },
    });
    expect(client.sendTeleopCommand).toHaveBeenCalledOnce();
    expect(client.publishRosTopic).not.toHaveBeenCalled();
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
          allowed_teleop_targets: ["/safe_teleop"],
        },
        teleopSequence: 43,
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      detail: 'Teleop target "/teleop_cmd" is not allowed by this app runtime policy.',
      request: {
        target: "/teleop_cmd",
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
