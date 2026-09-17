import {
  type BloomApiClient,
  BloomApiError,
  type RosTopicPublishRequest,
  type RuntimeActionPreset,
  type RuntimeAdapterPolicy,
  type RuntimeControlState,
} from "@bloom/api-client";
import { resolveTeleopFrameId, type Vector2Value, type WidgetActionIntent } from "@bloom/widgets";
import {
  type ComponentContribution,
  composeTwist,
  contributionFromAxisMap,
  defaultJoystickAxisMap,
  isZeroTwist,
  readAxisDeadZone,
  readWidgetAxisMap,
  type TeleopTwistComposer,
} from "./teleop-composition";

export type RuntimeVector3 = {
  x: number;
  y: number;
  z: number;
};

export type RuntimeTeleopCommandRequest = {
  angular: RuntimeVector3;
  /** Rotation frame for cartesian_manager; omitted uses the backend default. */
  frame_id?: string;
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
    frame_id: string;
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

/** Names a subscription by the same widget_id and topic that opened it. */
export type RuntimeTopicUnsubscriptionRequest = {
  topic: string;
  type: "unsubscribe_topic";
  widget_id?: string;
};

export type RuntimeTopicUnsubscriptionResponse = {
  detail: string;
  payload: { removed: boolean; topic: string; widget_id?: string };
  type: "unsubscription_ack";
};

/** Names the app the socket is running, so its runtime policy applies to teleop too. */
export type RuntimeAppContextRequest = {
  app_id: string;
  config_id: string;
};

export type RuntimeAppContextResponse = {
  detail: string;
  payload: { allowed_teleop_targets: string[]; app_id: string; config_id: string };
  type: "app_context_ack";
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

/** Teleop link state; "connecting" also covers "never asked yet". */
export type RuntimeLinkState = "connecting" | "connected" | "disconnected";

export type RuntimeActionClient = Pick<BloomApiClient, "publishRosTopic"> & {
  addRuntimeControlStateListener?: (listener: (state: RuntimeControlState | null) => void) => () => void;
  addRuntimeLinkStateListener?: (listener: (state: RuntimeLinkState) => void) => () => void;
  addRuntimeTopicSampleListener?: (listener: (sample: RuntimeTopicSampleMessage) => void) => () => void;
  deleteSavedPosition?: BloomApiClient["deleteSavedPosition"];
  disconnectRuntime?: () => void;
  dispatchRuntimeAction?: BloomApiClient["dispatchRuntimeAction"];
  exportSavedPositions?: BloomApiClient["exportSavedPositions"];
  listSavedPositions?: BloomApiClient["listSavedPositions"];
  saveSavedPosition?: BloomApiClient["saveSavedPosition"];
  engageRuntimeStop?: BloomApiClient["engageRuntimeStop"];
  ensureRuntimeConnected?: () => Promise<void>;
  getRuntimeStopState?: BloomApiClient["getRuntimeStopState"];
  getRuntimeControlState?: BloomApiClient["getRuntimeControlState"];
  getRuntimeSessionId?: () => string;
  listRosTopicStatus?: BloomApiClient["listRosTopicStatus"];
  listRosTopics?: BloomApiClient["listRosTopics"];
  listRuntimeAuditRecords?: BloomApiClient["listRuntimeAuditRecords"];
  listRuntimeCapabilities?: BloomApiClient["listRuntimeCapabilities"];
  resumeRuntimeStop?: BloomApiClient["resumeRuntimeStop"];
  claimRuntimeControl?: () => Promise<RuntimeControlState>;
  releaseRuntimeControl?: () => Promise<RuntimeControlState>;
  sendTeleopCommand?: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
  setRuntimeAppContext?: (request: RuntimeAppContextRequest) => Promise<RuntimeAppContextResponse>;
  startRuntimeRecording?: BloomApiClient["startRuntimeRecording"];
  stopRuntimeRecording?: BloomApiClient["stopRuntimeRecording"];
  subscribeRuntimeTopic?: (request: RuntimeTopicSubscriptionRequest) => Promise<RuntimeTopicSubscriptionResponse>;
  unsubscribeRuntimeTopic?: (request: RuntimeTopicUnsubscriptionRequest) => Promise<RuntimeTopicUnsubscriptionResponse>;
};

export type RuntimeActionDispatchStatus =
  | "accepted"
  | "blocked"
  | "called"
  | "coalesced"
  | "failed"
  | "published"
  | "simulated"
  | "unsupported";
export type RuntimeConfiguredActionRequest = {
  app_id: string;
  command?: string;
  config_id: string;
  preset_id?: string;
  type: "runtime_action";
};
export type RuntimeActionRequest =
  | RosTopicPublishRequest
  | RuntimeConfiguredActionRequest
  | RuntimeTeleopCommandRequest;

export type RuntimeActionDispatchResult = {
  detail: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionRequest;
  status: RuntimeActionDispatchStatus;
};

export function isRuntimeActionConfirmed(result: RuntimeActionDispatchResult): boolean {
  return result.status === "accepted" || result.status === "called" || result.status === "published";
}

export function isRuntimeActionProblem(
  result: RuntimeActionDispatchResult,
): result is RuntimeActionDispatchResult & { status: "blocked" | "failed" | "simulated" | "unsupported" } {
  return (
    result.status === "blocked" ||
    result.status === "failed" ||
    result.status === "simulated" ||
    result.status === "unsupported"
  );
}

export type RuntimeActionDispatchOptions = {
  actionPresets?: readonly RuntimeActionPreset[];
  allowedCommandFrameIds?: readonly string[];
  appId?: string;
  configId?: string;
  onCommandFrameChange?: (frameId: string) => void;
  runtimePolicy?: RuntimeAdapterPolicy;
  /**
   * Accumulates per-widget twist contributions so a full 6-DoF command can be
   * composed. Omitted keeps the historical single-widget behaviour.
   */
  teleopComposer?: TeleopTwistComposer;
  teleopCommandSender?: (request: RuntimeTeleopCommandRequest) => Promise<{
    detail: string;
    frameId?: string;
    status: "accepted" | "coalesced" | "simulated";
  }>;
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
  const teleopFrameId = resolveTeleopFrameId(intent.runtimeBinding);
  if (teleopFrameId) {
    return dispatchTeleopFrameIntent(client, intent, teleopFrameId, options);
  }

  const preset = findActionPreset(intent, options.actionPresets ?? []);
  const request = preset ? createPresetTopicPublishRequest(preset) : null;
  const configuredActionRequest = createConfiguredActionRequest(intent, options, preset);
  if (configuredActionRequest && client.dispatchRuntimeAction) {
    if (request) {
      const policyError = validateTopicPublishRequest(request, options.runtimePolicy);
      if (policyError) {
        return {
          intent,
          request,
          status: "blocked",
          detail: policyError,
        };
      }
    }

    try {
      const response = await client.dispatchRuntimeAction({
        app_id: configuredActionRequest.app_id,
        command: configuredActionRequest.command,
        config_id: configuredActionRequest.config_id,
        preset_id: configuredActionRequest.preset_id,
      });
      return {
        intent,
        request: configuredActionRequest,
        status: response.status,
        detail: response.detail,
      };
    } catch (error: unknown) {
      return {
        intent,
        request: configuredActionRequest,
        status: "failed",
        detail: getErrorMessage(error),
      };
    }
  }

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

async function dispatchTeleopFrameIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  frameId: string,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  if (options.allowedCommandFrameIds && !options.allowedCommandFrameIds.includes(frameId)) {
    return {
      intent,
      status: "blocked",
      detail: `Command frame "${frameId}" is not available on this robot.`,
    };
  }
  if (!options.teleopComposer) {
    return {
      intent,
      status: "unsupported",
      detail: "Runtime frame selection needs the composed teleop state.",
    };
  }
  if (!isZeroTwist(options.teleopComposer.compose())) {
    return {
      intent,
      status: "blocked",
      detail: "Release every motion control before changing the command frame.",
    };
  }
  if (!options.onCommandFrameChange) {
    return {
      intent,
      status: "unsupported",
      detail: "Runtime frame selection is not connected to this operator session.",
    };
  }

  const request: RuntimeTeleopCommandRequest = {
    type: "teleop_cmd",
    angular: { x: 0, y: 0, z: 0 },
    frame_id: frameId,
    linear: { x: 0, y: 0, z: 0 },
    mode: 0,
    seq: options.teleopSequence ?? 0,
    target: "/joystick_cartesian_command",
  };
  const policyError = validateTeleopCommandRequest(request, options.runtimePolicy);
  if (policyError) {
    return { intent, request, status: "blocked", detail: policyError };
  }
  if (!options.teleopCommandSender && !client.sendTeleopCommand) {
    return {
      intent,
      request,
      status: "unsupported",
      detail: "Runtime frame selection needs a live teleop connection.",
    };
  }

  try {
    const outcome = options.teleopCommandSender
      ? await options.teleopCommandSender(request)
      : await client.sendTeleopCommand?.(request).then((response) => ({
          detail: response.detail,
          frameId: response.payload.frame_id,
          status: response.payload.status,
        }));
    if (!outcome) {
      throw new Error("Runtime frame selection did not receive a teleop acknowledgement.");
    }
    if (outcome.status !== "accepted") {
      return { intent, request, status: outcome.status, detail: outcome.detail };
    }
    if (outcome.frameId !== frameId) {
      return {
        intent,
        request,
        status: "failed",
        detail: `Backend acknowledged command frame "${outcome.frameId ?? "<missing>"}" instead of "${frameId}".`,
      };
    }

    options.onCommandFrameChange(frameId);
    return {
      intent,
      request,
      status: "accepted",
      detail: `Command frame changed to "${frameId}" for this operator session.`,
    };
  } catch (error: unknown) {
    return { intent, request, status: "failed", detail: getErrorMessage(error) };
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
  const request = createTeleopCommandRequest(
    intent,
    options.teleopSequence ?? 0,
    options.teleopComposer,
    options.runtimePolicy?.command_frame_id,
  );
  if (request) {
    const frameError = validateCommandFrameRequest(request, options.allowedCommandFrameIds);
    if (frameError) {
      return {
        intent,
        request,
        status: "blocked",
        detail: frameError,
      };
    }
    const policyError = validateTeleopCommandRequest(request, options.runtimePolicy);
    if (policyError) {
      return {
        intent,
        request,
        status: "blocked",
        detail: policyError,
      };
    }

    if (!options.teleopCommandSender && !client.sendTeleopCommand) {
      return {
        intent,
        request,
        status: "unsupported",
        detail: "Teleop intents need a runtime WebSocket client before they can be sent.",
      };
    }

    try {
      if (options.teleopCommandSender) {
        const outcome = await options.teleopCommandSender(request);
        return {
          intent,
          request,
          status: outcome.status,
          detail: outcome.detail,
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

function createConfiguredActionRequest(
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  options: RuntimeActionDispatchOptions,
  preset: RuntimeActionPreset | null,
): RuntimeConfiguredActionRequest | null {
  if (!options.configId || !options.appId || (!preset?.id && !intent.command)) {
    return null;
  }

  return {
    type: "runtime_action",
    app_id: options.appId,
    command: preset?.command || intent.command,
    config_id: options.configId,
    preset_id: preset?.id ?? intent.presetId,
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
  composer?: TeleopTwistComposer,
  commandFrameId = "",
): RuntimeTeleopCommandRequest | null {
  const runtimeBinding = getRecord(intent.runtimeBinding);
  if (getOptionalString(runtimeBinding, "adapter") !== "teleop") {
    return null;
  }

  const valueMapping = getRecord(runtimeBinding.value_mapping);
  const mode = getOptionalNumber(valueMapping, "mode") ?? resolveTeleopMode(intent.modeId);
  const target = resolveTeleopTarget(valueMapping);
  // The app-level frame wins so every axis on the virtual IHM shares one
  // reference. Per-widget values remain a backwards-compatible fallback.
  const frameId = commandFrameId.trim() || getOptionalString(valueMapping, "frame_id");

  const contribution = teleopContributionFromIntent(intent, runtimeBinding);
  if (!contribution) {
    return null;
  }

  // Without a composer, keep the historical single-widget behaviour so an app
  // that has not opted into axis mapping publishes exactly what it did before.
  if (!composer) {
    const twist = composeTwist([contribution]);
    return {
      type: "teleop_cmd",
      angular: twist.angular,
      ...(frameId ? { frame_id: frameId } : {}),
      linear: twist.linear,
      mode,
      seq: sequence,
      target,
    };
  }

  // cartesian_manager replaces the latest command per source rather than
  // accumulating it, so every publish has to carry the whole twist.
  composer.contribute(intent.widgetId, contribution);
  const twist = composer.compose();

  return {
    type: "teleop_cmd",
    angular: twist.angular,
    ...(frameId ? { frame_id: frameId } : {}),
    linear: twist.linear,
    mode,
    seq: sequence,
    target,
  };
}

/** Map one widget intent onto twist components, honouring `axis_mapping`. */
export function teleopContributionFromIntent(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  runtimeBinding: Record<string, unknown>,
): ComponentContribution | null {
  const declared = readWidgetAxisMap(runtimeBinding, intent.modeId);
  // Opt-in per-axis dead zone matching joystick_mapper. Without it the previous
  // behaviour is preserved exactly.
  const deadZone = readAxisDeadZone(runtimeBinding);

  if (isVector2Value(intent.value)) {
    const axisMap = declared ?? defaultJoystickAxisMap(isRotationMode(intent.modeId));
    // Clamp to the unit disk before mapping, so a diagonal push cannot exceed
    // magnitude 1. This is a property of the touch surface rather than of the
    // mapping, and it is the long-standing joystick contract.
    const normalized = normalizeTeleopJoystickVector(intent.value);
    return contributionFromAxisMap(axisMap, { x: normalized.x, y: normalized.y }, deadZone);
  }

  // A scalar widget only reaches the twist when it says which component it
  // drives. Guessing would silently move an axis the operator did not choose.
  if (typeof intent.value === "number" && Number.isFinite(intent.value) && declared?.value) {
    return contributionFromAxisMap(declared, { value: intent.value }, deadZone);
  }

  return null;
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

function validateCommandFrameRequest(
  request: RuntimeTeleopCommandRequest,
  allowedCommandFrameIds: readonly string[] | undefined,
): string | null {
  if (!request.frame_id || !allowedCommandFrameIds || allowedCommandFrameIds.includes(request.frame_id)) {
    return null;
  }
  return `Command frame "${request.frame_id}" is not available on this robot.`;
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
  // cartesian_manager input. The legacy /teleop_cmd path is reachable by
  // configuring target_topic explicitly on the widget binding.
  return "/joystick_cartesian_command";
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

function normalizeTeleopJoystickVector(value: Vector2Value): RuntimeVector3 {
  const x = toFiniteTeleopAxis(value.x);
  const y = toFiniteTeleopAxis(value.y);
  const magnitude = Math.hypot(x, y);

  if (magnitude <= 1) {
    return { x: clampSignedUnit(x), y: clampSignedUnit(y), z: 0 };
  }

  return {
    x: clampSignedUnit(x / magnitude),
    y: clampSignedUnit(y / magnitude),
    z: 0,
  };
}

function toFiniteTeleopAxis(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampSignedUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
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
  if (error instanceof BloomApiError) {
    // Surface the response body's reason, not just the status code.
    const detail = readBloomApiErrorDetail(error.responseText);
    return detail ? `${error.message} ${detail}` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Runtime action failed.";
}

function readBloomApiErrorDetail(responseText: string): string {
  if (!responseText) {
    return "";
  }
  try {
    const parsed = JSON.parse(responseText) as { detail?: unknown };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((entry) => (isRecord(entry) && typeof entry.msg === "string" ? entry.msg : ""))
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    return responseText.slice(0, 200);
  }
  return "";
}
