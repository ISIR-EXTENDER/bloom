import type { WidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it, vi } from "vitest";
import {
  createRosTopicPublishRequest,
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
