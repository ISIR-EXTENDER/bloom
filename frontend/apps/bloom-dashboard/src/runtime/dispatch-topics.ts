import type { RosTopicPublishRequest, RuntimeActionPreset, RuntimeAdapterPolicy } from "@bloom/api-client";
import {
  asRecord,
  asTopic,
  isRecord,
  readOptionalString,
  readValueMappingTopic,
  type WidgetActionIntent,
} from "@bloom/widgets";
import {
  appScope,
  getErrorMessage,
  isAllowedByPolicy,
  type RuntimeActionDispatchOptions,
  type RuntimeActionDispatchResult,
} from "./dispatch-result";
import { isVector2Value } from "./dispatch-teleop";
import type { RuntimeActionClient } from "./runtime-protocol";

/** A ROS message the app policy allows, published through the API client. */
export async function publishTopicRequest(
  client: RuntimeActionClient,
  intent: WidgetActionIntent,
  request: RosTopicPublishRequest,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  const policyError = validateTopicPublishRequest(request, options.runtimePolicy);
  if (policyError) {
    return { intent, request, status: "blocked", detail: policyError };
  }
  try {
    const response = await client.publishRosTopic({ ...request, ...appScope(options) });
    return { intent, request, status: response.status, detail: response.detail };
  } catch (error: unknown) {
    return { intent, request, status: "failed", detail: getErrorMessage(error) };
  }
}

export async function dispatchTopicPublishIntent(
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
  return publishTopicRequest(client, intent, request, options);
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

export function createValueTopicPublishRequest(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
): RosTopicPublishRequest | null {
  if (!isPublishableValue(intent.value)) {
    return null;
  }

  const runtimeBinding = asRecord(intent.runtimeBinding);
  const valueMapping = asRecord(runtimeBinding.value_mapping);
  const adapter = readOptionalString(runtimeBinding.adapter);
  const topic = readValueMappingTopic(valueMapping) ?? asTopic(runtimeBinding.target) ?? asTopic(intent.topic);
  if (!topic || (adapter && adapter !== "topic")) {
    return null;
  }

  const messageType =
    readOptionalString(valueMapping.message_type) ??
    readOptionalString(valueMapping.messageType) ??
    intent.messageType ??
    (typeof intent.value === "number" ? "std_msgs/msg/Float64" : undefined);
  if (!messageType) {
    return null;
  }
  const fieldPath = readOptionalString(valueMapping.field_path) ?? readOptionalString(valueMapping.field) ?? "data";

  return {
    topic,
    message_type: messageType,
    payload: createValuePayload(fieldPath, intent.value, messageType),
  };
}

export function findActionPreset(
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  presets: readonly RuntimeActionPreset[],
): RuntimeActionPreset | null {
  return (
    presets.find((preset) => preset.id === intent.presetId) ??
    presets.find((preset) => preset.command && preset.command === intent.command) ??
    null
  );
}

export function createPresetTopicPublishRequest(preset: RuntimeActionPreset): RosTopicPublishRequest | null {
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

export function validateTopicPublishRequest(
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

function toPayloadBody(payload: unknown): Pick<RosTopicPublishRequest, "payload" | "payload_text"> {
  if (typeof payload === "string") {
    return { payload_text: payload };
  }
  if (isRecord(payload)) {
    return { payload };
  }
  return { payload: { data: payload } };
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

function isPublishableValue(value: unknown): value is number | Record<string, unknown> {
  return (typeof value === "number" && Number.isFinite(value)) || isRecord(value);
}

function normalizeMessageType(messageType: string): string {
  return messageType.trim().toLowerCase();
}
