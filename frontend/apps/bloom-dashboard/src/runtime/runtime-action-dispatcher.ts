import type { BloomApiClient, RosTopicPublishRequest } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";

export type RuntimeActionClient = Pick<BloomApiClient, "publishRosTopic">;

export type RuntimeActionDispatchStatus = "failed" | "published" | "simulated" | "unsupported";

export type RuntimeActionDispatchResult = {
  detail: string;
  intent: WidgetActionIntent;
  request?: RosTopicPublishRequest;
  status: RuntimeActionDispatchStatus;
};

export async function dispatchRuntimeActionIntent(
  client: RuntimeActionClient,
  intent: WidgetActionIntent,
): Promise<RuntimeActionDispatchResult> {
  if (intent.type !== "topic-publish") {
    return {
      intent,
      status: "unsupported",
      detail: `Runtime intent "${intent.type}" is not connected to a backend adapter yet.`,
    };
  }

  const request = createRosTopicPublishRequest(intent);
  if (!request) {
    return {
      intent,
      status: "unsupported",
      detail: "Topic publish intents need a ROS message type before they can be sent.",
    };
  }

  try {
    const response = await client.publishRosTopic(request);
    return {
      intent,
      request,
      status: response.status,
      detail: response.detail,
    };
  } catch (error: unknown) {
    return {
      intent,
      request,
      status: "failed",
      detail: getErrorMessage(error),
    };
  }
}

export function createRosTopicPublishRequest(intent: Extract<WidgetActionIntent, { type: "topic-publish" }>) {
  if (!intent.messageType) {
    return null;
  }

  return {
    topic: intent.topic,
    message_type: intent.messageType,
    ...toPayloadBody(intent.payload),
  } satisfies RosTopicPublishRequest;
}

function toPayloadBody(payload: unknown): Pick<RosTopicPublishRequest, "payload" | "payload_text"> {
  if (typeof payload === "string") {
    return { payload_text: payload };
  }
  if (isRecord(payload)) {
    return { payload };
  }
  return { payload: { data: payload } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Runtime action failed.";
}
