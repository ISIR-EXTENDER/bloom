import type { RuntimeControlState } from "@bloom/api-client";
import { isRecord } from "@bloom/widgets";
import type {
  RuntimeAppContextResponse,
  RuntimeTeleopCommandResponse,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionResponse,
  RuntimeTopicUnsubscriptionResponse,
} from "./runtime-action-dispatcher";
/** What the runtime socket sends, read into the types the client hands out. */
export function parseRuntimeSessionConnected(data: unknown): RuntimeControlState | null {
  const parsed = parseFrame(data) as {
    active_sessions?: unknown;
    payload?: Partial<RuntimeControlState>;
    session_id?: unknown;
    type?: unknown;
  } | null;
  if (!parsed) {
    return null;
  }
  if (parsed.type !== "session_connected" || typeof parsed.session_id !== "string") {
    return null;
  }
  return {
    active_sessions:
      typeof parsed.payload?.active_sessions === "number"
        ? parsed.payload.active_sessions
        : typeof parsed.active_sessions === "number"
          ? parsed.active_sessions
          : 1,
    detail: typeof parsed.payload?.detail === "string" ? parsed.payload.detail : "Runtime session connected.",
    is_owner: parsed.payload?.is_owner === true,
    owner_present: parsed.payload?.owner_present === true,
    session_id: parsed.session_id,
  };
}

export function parseRuntimeControlState(data: unknown): RuntimeControlState | null {
  const parsed = parseFrame(data) as {
    detail?: unknown;
    payload?: Partial<RuntimeControlState>;
    session_id?: unknown;
    type?: unknown;
  } | null;
  if (!parsed) {
    return null;
  }
  if (
    parsed.type !== "control_state" ||
    typeof parsed.session_id !== "string" ||
    typeof parsed.payload?.active_sessions !== "number" ||
    typeof parsed.payload?.is_owner !== "boolean" ||
    typeof parsed.payload?.owner_present !== "boolean"
  ) {
    return null;
  }
  return {
    active_sessions: parsed.payload.active_sessions,
    detail: typeof parsed.detail === "string" ? parsed.detail : "Runtime control state updated.",
    is_owner: parsed.payload.is_owner,
    owner_frame_id: parsed.payload.owner_frame_id ?? "",
    owner_mode_request: parsed.payload.owner_mode_request ?? "",
    owner_moving: parsed.payload.owner_moving === true,
    owner_present: parsed.payload.owner_present,
    session_id: parsed.session_id,
  };
}

/** A frame off the socket, or null when it is not a string or not a JSON object. */
function parseFrame(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A reply of one type carrying a payload, read as the response type it announces. */
function replyParser<T>(type: string, accept: (payload: Record<string, unknown>) => boolean = () => true) {
  return (data: unknown): T | null => {
    const frame = parseFrame(data);
    return frame?.type === type && isRecord(frame.payload) && accept(frame.payload) ? (frame as unknown as T) : null;
  };
}

export const parseAppContextAck = replyParser<RuntimeAppContextResponse>("app_context_ack");
export const parseTeleopAck = replyParser<RuntimeTeleopCommandResponse>("teleop_ack");
export const parseTopicSubscriptionAck = replyParser<RuntimeTopicSubscriptionResponse>("subscription_ack");
export const parseTopicUnsubscriptionAck = replyParser<RuntimeTopicUnsubscriptionResponse>("unsubscription_ack");
export const parseTopicSample = replyParser<RuntimeTopicSampleMessage>(
  "topic_sample",
  (payload) => typeof payload.topic === "string",
);

export function parsePong(data: unknown): { type: "pong" } | null {
  return parseFrame(data)?.type === "pong" ? { type: "pong" } : null;
}

export function parseRuntimeError(
  data: unknown,
): { code: string; controlState: RuntimeControlState | null; error: Error } | null {
  const parsed = parseFrame(data) as {
    detail?: unknown;
    payload?: {
      active_sessions?: unknown;
      code?: unknown;
      is_owner?: unknown;
      message?: unknown;
      owner_present?: unknown;
      session_id?: unknown;
    };
    session_id?: unknown;
    type?: unknown;
  } | null;
  if (!parsed) {
    return null;
  }
  if (parsed.type !== "runtime_error") {
    return null;
  }
  const payloadMessage = typeof parsed.payload?.message === "string" ? parsed.payload.message : undefined;
  const detail = typeof parsed.detail === "string" ? parsed.detail : "Runtime command failed.";
  const payloadSessionId = parsed.payload?.session_id;
  const responseSessionId = parsed.session_id;
  const controlState =
    typeof parsed.payload?.active_sessions === "number" &&
    typeof parsed.payload?.is_owner === "boolean" &&
    typeof parsed.payload?.owner_present === "boolean" &&
    typeof payloadSessionId === "string" &&
    payloadSessionId === responseSessionId
      ? {
          active_sessions: parsed.payload.active_sessions,
          detail,
          is_owner: parsed.payload.is_owner,
          owner_present: parsed.payload.owner_present,
          session_id: payloadSessionId,
        }
      : null;
  return {
    code: typeof parsed.payload?.code === "string" ? parsed.payload.code : "",
    controlState,
    error: new Error(payloadMessage ? `${detail} ${payloadMessage}` : detail),
  };
}
