import type { BloomApiClient, RosTopicPublishRequest } from "@bloom/api-client";
import type { Vector2Value, WidgetActionIntent } from "@bloom/widgets";

export type RuntimeVector3 = {
  x: number;
  y: number;
  z: number;
};

export type RuntimeTeleopCommandRequest = {
  angular: RuntimeVector3;
  linear: RuntimeVector3;
  mode: number;
  seq: number;
  target: string;
  type: "teleop_cmd";
};

export type RuntimeTeleopCommandResponse = {
  detail: string;
  payload: {
    angular: RuntimeVector3;
    linear: RuntimeVector3;
    mode: number;
    seq: number;
    status: "accepted" | "simulated";
    target: string;
  };
  type: "teleop_ack";
};

export type RuntimeActionClient = Pick<BloomApiClient, "publishRosTopic"> & {
  sendTeleopCommand?: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
};

export type RuntimeActionDispatchStatus = "accepted" | "failed" | "published" | "simulated" | "unsupported";
export type RuntimeActionRequest = RosTopicPublishRequest | RuntimeTeleopCommandRequest;

export type RuntimeActionDispatchResult = {
  detail: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionRequest;
  status: RuntimeActionDispatchStatus;
};

export async function dispatchRuntimeActionIntent(
  client: RuntimeActionClient,
  intent: WidgetActionIntent,
): Promise<RuntimeActionDispatchResult> {
  if (intent.type === "topic-publish") {
    return dispatchTopicPublishIntent(client, intent);
  }

  if (intent.type === "value-change") {
    return dispatchTeleopValueIntent(client, intent);
  }

  return {
    intent,
    status: "unsupported",
    detail: `Runtime intent "${intent.type}" is not connected to a backend adapter yet.`,
  };
}

async function dispatchTopicPublishIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "topic-publish" }>,
): Promise<RuntimeActionDispatchResult> {
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

async function dispatchTeleopValueIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
): Promise<RuntimeActionDispatchResult> {
  const request = createTeleopCommandRequest(intent);
  if (!request) {
    return {
      intent,
      status: "unsupported",
      detail: "Value-change intents need a teleop runtime binding before they can be sent.",
    };
  }

  if (!client.sendTeleopCommand) {
    return {
      intent,
      request,
      status: "unsupported",
      detail: "Teleop intents need a runtime WebSocket client before they can be sent.",
    };
  }

  try {
    const response = await client.sendTeleopCommand(request);
    return {
      intent,
      request,
      status: response.payload.status,
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

export function createTeleopCommandRequest(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  sequence = 0,
): RuntimeTeleopCommandRequest | null {
  if (!isVector2Value(intent.value)) {
    return null;
  }

  const runtimeBinding = getRecord(intent.runtimeBinding);
  if (getOptionalString(runtimeBinding, "adapter") !== "teleop") {
    return null;
  }

  const valueMapping = getRecord(runtimeBinding.value_mapping);
  const mode = getOptionalNumber(valueMapping, "mode") ?? resolveTeleopMode(intent.modeId);
  const target = resolveTeleopTarget(valueMapping);
  const vectors = mapJoystickValueToTeleopVectors(intent.value, intent.modeId);

  return {
    type: "teleop_cmd",
    angular: vectors.angular,
    linear: vectors.linear,
    mode,
    seq: sequence,
    target,
  };
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

function mapJoystickValueToTeleopVectors(
  value: Vector2Value,
  modeId: string | undefined,
): Pick<RuntimeTeleopCommandRequest, "angular" | "linear"> {
  const zero = { x: 0, y: 0, z: 0 };
  const joystickVector = { x: clampTeleopAxis(value.x), y: clampTeleopAxis(value.y), z: 0 };

  if (isRotationMode(modeId)) {
    return {
      angular: joystickVector,
      linear: zero,
    };
  }

  return {
    angular: zero,
    linear: joystickVector,
  };
}

function resolveTeleopMode(modeId: string | undefined): number {
  const normalizedMode = normalizeModeId(modeId);
  if (normalizedMode === "rotation") {
    return 1;
  }
  if (normalizedMode === "translation") {
    return 2;
  }
  if (normalizedMode === "snake") {
    return 4;
  }
  return 3;
}

function resolveTeleopTarget(valueMapping: Record<string, unknown>): string {
  const topic = getOptionalString(valueMapping, "target_topic") ?? getOptionalString(valueMapping, "topic");
  if (topic?.startsWith("/")) {
    return topic;
  }
  return "/teleop_cmd";
}

function isRotationMode(modeId: string | undefined): boolean {
  return normalizeModeId(modeId) === "rotation";
}

function normalizeModeId(modeId: string | undefined): string {
  return (modeId ?? "both").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function clampTeleopAxis(value: number): number {
  return Math.max(-20, Math.min(20, value));
}

function isVector2Value(value: unknown): value is Vector2Value {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function getOptionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getOptionalString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Runtime action failed.";
}
