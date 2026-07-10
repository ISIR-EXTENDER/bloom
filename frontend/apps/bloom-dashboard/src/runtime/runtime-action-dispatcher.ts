import type {
  BloomApiClient,
  RosTopicPublishRequest,
  RuntimeActionPreset,
  RuntimeAdapterPolicy,
} from "@bloom/api-client";
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

export type RuntimeTopicSubscriptionRequest = {
  field_path: string;
  message_type: string;
  topic: string;
  type: "subscribe_topic";
  widget_id?: string;
};

export type RuntimeTopicSubscriptionResponse = {
  detail: string;
  payload: {
    field_path: string;
    message_type: string;
    topic: string;
    widget_id?: string;
  };
  type: "subscription_ack";
};

export type RuntimeTopicSampleMessage = {
  detail: string;
  payload: {
    message_type: string;
    received_at: string;
    topic: string;
    value: unknown;
  };
  type: "topic_sample";
};

export type RuntimeActionClient = Pick<BloomApiClient, "publishRosTopic"> & {
  addRuntimeTopicSampleListener?: (listener: (sample: RuntimeTopicSampleMessage) => void) => () => void;
  listRosTopicStatus?: BloomApiClient["listRosTopicStatus"];
  listRosTopics?: BloomApiClient["listRosTopics"];
  listRuntimeAuditRecords?: BloomApiClient["listRuntimeAuditRecords"];
  sendTeleopCommand?: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
  startRuntimeRecording?: BloomApiClient["startRuntimeRecording"];
  stopRuntimeRecording?: BloomApiClient["stopRuntimeRecording"];
  subscribeRuntimeTopic?: (request: RuntimeTopicSubscriptionRequest) => Promise<RuntimeTopicSubscriptionResponse>;
};

export type RuntimeActionDispatchStatus = "accepted" | "blocked" | "failed" | "published" | "simulated" | "unsupported";
export type RuntimeActionRequest = RosTopicPublishRequest | RuntimeTeleopCommandRequest;

export type RuntimeActionDispatchResult = {
  detail: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionRequest;
  status: RuntimeActionDispatchStatus;
};

export type RuntimeActionDispatchOptions = {
  actionPresets?: readonly RuntimeActionPreset[];
  runtimePolicy?: RuntimeAdapterPolicy;
  teleopSequence?: number;
};

export async function dispatchRuntimeActionIntent(
  client: RuntimeActionClient,
  intent: WidgetActionIntent,
  options: RuntimeActionDispatchOptions = {},
): Promise<RuntimeActionDispatchResult> {
  if (intent.type === "topic-publish") {
    return dispatchTopicPublishIntent(client, intent, options);
  }

  if (intent.type === "value-change") {
    return dispatchTeleopValueIntent(client, intent, options);
  }

  if (intent.type === "command") {
    return dispatchCommandIntent(client, intent, options);
  }

  return {
    intent,
    status: "unsupported",
    detail: `Runtime intent "${intent.type}" is not connected to a backend adapter yet.`,
  };
}

async function dispatchCommandIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  const preset = findActionPreset(intent, options.actionPresets ?? []);
  const request = preset ? createPresetTopicPublishRequest(preset) : null;
  if (!request) {
    return {
      intent,
      status: "unsupported",
      detail: `Command "${intent.command}" is not connected to a runtime adapter yet.`,
    };
  }

  const policyError = validateTopicPublishRequest(request, options.runtimePolicy);
  if (policyError) {
    return {
      intent,
      request,
      status: "blocked",
      detail: policyError,
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

async function dispatchTopicPublishIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "topic-publish" }>,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  const request = createRosTopicPublishRequest(intent);
  if (!request) {
    return {
      intent,
      status: "unsupported",
      detail: "Topic publish intents need a ROS message type before they can be sent.",
    };
  }

  const policyError = validateTopicPublishRequest(request, options.runtimePolicy);
  if (policyError) {
    return {
      intent,
      request,
      status: "blocked",
      detail: policyError,
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
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  const request = createTeleopCommandRequest(intent, options.teleopSequence ?? 0);
  if (request) {
    const policyError = validateTeleopCommandRequest(request, options.runtimePolicy);
    if (policyError) {
      return {
        intent,
        request,
        status: "blocked",
        detail: policyError,
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

  const topicRequest = createValueTopicPublishRequest(intent);
  if (topicRequest) {
    const policyError = validateTopicPublishRequest(topicRequest, options.runtimePolicy);
    if (policyError) {
      return {
        intent,
        request: topicRequest,
        status: "blocked",
        detail: policyError,
      };
    }

    try {
      const response = await client.publishRosTopic(topicRequest);
      return {
        intent,
        request: topicRequest,
        status: response.status,
        detail: response.detail,
      };
    } catch (error: unknown) {
      return {
        intent,
        request: topicRequest,
        status: "failed",
        detail: getErrorMessage(error),
      };
    }
  }

  return {
    intent,
    status: "unsupported",
    detail: "Value-change intents need a teleop or topic runtime binding before they can be sent.",
  };
}

function findActionPreset(
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  presets: readonly RuntimeActionPreset[],
): RuntimeActionPreset | null {
  return (
    presets.find((preset) => preset.id === intent.presetId) ??
    presets.find((preset) => preset.command && preset.command === intent.command) ??
    null
  );
}

function createPresetTopicPublishRequest(preset: RuntimeActionPreset): RosTopicPublishRequest | null {
  if (preset.kind !== "topic-publish" || !preset.topic || !preset.message_type) {
    return null;
  }

  const payload = preset.payload_text || preset.payload;
  return {
    topic: preset.topic,
    message_type: preset.message_type,
    ...toPayloadBody(payload),
  };
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

export function createScalarTopicPublishRequest(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
): RosTopicPublishRequest | null {
  if (typeof intent.value !== "number" || !Number.isFinite(intent.value)) {
    return null;
  }

  return createValueTopicPublishRequest(intent);
}

export function createValueTopicPublishRequest(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
): RosTopicPublishRequest | null {
  if (!isPublishableValue(intent.value)) {
    return null;
  }

  const runtimeBinding = getRecord(intent.runtimeBinding);
  const valueMapping = getRecord(runtimeBinding.value_mapping);
  const adapter = getOptionalString(runtimeBinding, "adapter");
  const topic = resolveValueTopic(intent, runtimeBinding, valueMapping);
  if (!topic || (adapter && adapter !== "topic")) {
    return null;
  }

  const messageType =
    getOptionalString(valueMapping, "message_type") ??
    getOptionalString(valueMapping, "messageType") ??
    intent.messageType ??
    (typeof intent.value === "number" ? "std_msgs/msg/Float64" : undefined);
  if (!messageType) {
    return null;
  }
  const fieldPath = getOptionalString(valueMapping, "field_path") ?? getOptionalString(valueMapping, "field") ?? "data";

  return {
    topic,
    message_type: messageType,
    payload: createValuePayload(fieldPath, intent.value, messageType),
  };
}

function validateTopicPublishRequest(
  request: RosTopicPublishRequest,
  policy: RuntimeAdapterPolicy | undefined,
): string | null {
  if (!policy) {
    return null;
  }
  if (!isAllowedByPolicy(request.topic, policy.allowed_publish_topics)) {
    return `ROS topic "${request.topic}" is not allowed by this app runtime policy.`;
  }
  if (!isAllowedByPolicy(request.message_type, policy.allowed_message_types)) {
    return `ROS message type "${request.message_type}" is not allowed by this app runtime policy.`;
  }
  return null;
}

function validateTeleopCommandRequest(
  request: RuntimeTeleopCommandRequest,
  policy: RuntimeAdapterPolicy | undefined,
): string | null {
  if (!policy || isAllowedByPolicy(request.target, policy.allowed_teleop_targets)) {
    return null;
  }
  return `Teleop target "${request.target}" is not allowed by this app runtime policy.`;
}

function isAllowedByPolicy(value: string, allowedValues: readonly string[]): boolean {
  return allowedValues.length === 0 || allowedValues.includes("*") || allowedValues.includes(value);
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

function resolveValueTopic(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  runtimeBinding: Record<string, unknown>,
  valueMapping: Record<string, unknown>,
): string | null {
  const topic =
    getOptionalString(valueMapping, "target_topic") ??
    getOptionalString(valueMapping, "topic") ??
    getOptionalString(runtimeBinding, "target") ??
    intent.topic;
  return topic?.startsWith("/") ? topic : null;
}

function createValuePayload(
  fieldPath: string,
  value: number | Record<string, unknown>,
  messageType: string,
): Record<string, unknown> {
  const normalizedFieldPath = fieldPath.trim();
  if (!normalizedFieldPath || normalizedFieldPath === "data") {
    return createDefaultValuePayload(value, messageType);
  }

  const keys = normalizedFieldPath.split(".").filter(Boolean);
  if (keys.length === 0) {
    return createDefaultValuePayload(value, messageType);
  }

  return keys.reduceRight<Record<string, unknown> | number | Record<string, unknown>>(
    (payload, key) => ({ [key]: payload }),
    value,
  ) as Record<string, unknown>;
}

function createDefaultValuePayload(
  value: number | Record<string, unknown>,
  messageType: string,
): Record<string, unknown> {
  const normalizedMessageType = normalizeMessageType(messageType);
  if (normalizedMessageType === "std_msgs/msg/string" && typeof value !== "number") {
    return { data: JSON.stringify(value) };
  }
  if (normalizedMessageType === "geometry_msgs/msg/vector3" && isVector2Value(value)) {
    return { x: value.x, y: value.y, z: 0 };
  }
  return { data: value };
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

function isPublishableValue(value: unknown): value is number | Record<string, unknown> {
  return (typeof value === "number" && Number.isFinite(value)) || isRecord(value);
}

function normalizeMessageType(messageType: string): string {
  return messageType.trim().toLowerCase();
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
