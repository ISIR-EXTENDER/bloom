import type { RuntimeControlState } from "@bloom/api-client";
import type {
  RuntimeActionClient,
  RuntimeAppContextRequest,
  RuntimeAppContextResponse,
  RuntimeLinkState,
  RuntimeTeleopCommandRequest,
  RuntimeTeleopCommandResponse,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionRequest,
  RuntimeTopicSubscriptionResponse,
  RuntimeTopicUnsubscriptionRequest,
  RuntimeTopicUnsubscriptionResponse,
} from "./runtime-action-dispatcher";

type WebSocketEventMap = {
  close: Event;
  error: Event;
  message: MessageEvent;
  open: Event;
};

type WebSocketLike = {
  readonly readyState: number;
  addEventListener(type: keyof WebSocketEventMap, listener: (event: Event | MessageEvent) => void): void;
  close(): void;
  removeEventListener(type: keyof WebSocketEventMap, listener: (event: Event | MessageEvent) => void): void;
  send(data: string): void;
};

type WebSocketConstructorLike = {
  CONNECTING: number;
  OPEN: number;
  new (url: string, protocols?: string[]): WebSocketLike;
};

type PendingReply = {
  reject: (error: Error) => void;
  /** Resolves and returns true when the reply is the kind this request expects. */
  settle: (data: unknown) => boolean;
};

/**
 * The backend drops a control lease after 10 s of silence, so an operator who
 * is watching the screen and moving nothing still says it is there.
 */
export const RUNTIME_KEEPALIVE_INTERVAL_MS = 3000;

export type RuntimeWebSocketClientOptions = {
  protocols?: string[];
  url: string;
  WebSocketCtor?: WebSocketConstructorLike;
};

export function createRuntimeWebSocketClient(
  options: RuntimeWebSocketClientOptions,
): Required<
  Pick<
    RuntimeActionClient,
    | "addRuntimeControlStateListener"
    | "addRuntimeLinkStateListener"
    | "addRuntimeTopicSampleListener"
    | "claimRuntimeControl"
    | "disconnectRuntime"
    | "ensureRuntimeConnected"
    | "getRuntimeSessionId"
    | "releaseRuntimeControl"
    | "sendTeleopCommand"
    | "setRuntimeAppContext"
    | "subscribeRuntimeTopic"
    | "unsubscribeRuntimeTopic"
  >
> {
  const WebSocketCtor = options.WebSocketCtor ?? getDefaultWebSocketConstructor();
  let socket: WebSocketLike | null = null;
  let connectPromise: Promise<WebSocketLike> | null = null;
  let linkState: RuntimeLinkState = "connecting";
  let controlState: RuntimeControlState | null = null;
  let sessionId = "";
  // Re-sent on every socket, so a reconnect keeps the app's narrower policy.
  let appContext: RuntimeAppContextRequest | null = null;
  let appContextSocket: WebSocketLike | null = null;
  let appContextReply: Promise<RuntimeAppContextResponse> | null = null;
  // The server answers every request exactly once, in order, so replies match requests by position. Pings are the
  // exception: they hold no slot, and their pongs are recognised and dropped before the queue is touched.
  const pendingRepliesBySocket = new Map<WebSocketLike, PendingReply[]>();
  const topicSampleListeners = new Set<(sample: RuntimeTopicSampleMessage) => void>();
  const linkStateListeners = new Set<(state: RuntimeLinkState) => void>();
  const controlStateListeners = new Set<(state: RuntimeControlState | null) => void>();

  function setLinkState(nextState: RuntimeLinkState) {
    if (linkState === nextState) {
      return;
    }
    linkState = nextState;
    for (const listener of linkStateListeners) {
      listener(nextState);
    }
  }

  function setControlState(nextState: RuntimeControlState | null) {
    controlState = nextState;
    for (const listener of controlStateListeners) {
      listener(nextState);
    }
  }

  async function ensureConnected(): Promise<WebSocketLike> {
    if (socket?.readyState === WebSocketCtor.OPEN) {
      return socket;
    }
    if (socket?.readyState === WebSocketCtor.CONNECTING && connectPromise) {
      return connectPromise;
    }

    const nextSocket = new WebSocketCtor(options.url, options.protocols);
    socket = nextSocket;
    setLinkState("connecting");
    connectPromise = new Promise((resolve, reject) => {
      const handleOpen = () => {
        removeConnectionListeners();
        bindRuntimeListeners(nextSocket);
        sendAppContext(nextSocket);
        setLinkState("connected");
        resolve(nextSocket);
      };
      const handleFailure = () => {
        removeConnectionListeners();
        if (socket === nextSocket) {
          socket = null;
          connectPromise = null;
          setLinkState("disconnected");
        }
        reject(new Error("Bloom runtime WebSocket could not connect."));
      };
      const removeConnectionListeners = () => {
        nextSocket.removeEventListener("open", handleOpen);
        nextSocket.removeEventListener("close", handleFailure);
        nextSocket.removeEventListener("error", handleFailure);
      };

      nextSocket.addEventListener("open", handleOpen);
      nextSocket.addEventListener("close", handleFailure);
      nextSocket.addEventListener("error", handleFailure);
    });
    return connectPromise;
  }

  function bindRuntimeListeners(runtimeSocket: WebSocketLike) {
    const pendingReplies: PendingReply[] = [];
    pendingRepliesBySocket.set(runtimeSocket, pendingReplies);
    // A socket that was replaced still delivers its own replies, but no longer speaks for the link.
    const isCurrent = () => socket === runtimeSocket;
    const keepaliveTimer = setInterval(() => sendKeepalivePing(runtimeSocket), RUNTIME_KEEPALIVE_INTERVAL_MS);

    runtimeSocket.addEventListener("message", (event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      const connectedState = parseRuntimeSessionConnected(event.data);
      if (connectedState) {
        if (isCurrent()) {
          sessionId = connectedState.session_id;
          setControlState(connectedState);
        }
        return;
      }

      const topicSample = parseTopicSample(event.data);
      if (topicSample) {
        for (const listener of topicSampleListeners) {
          listener(topicSample);
        }
        return;
      }

      // The keepalive holds no queue slot, so a pong -- or a ping the server
      // never answers -- cannot shift every later reply onto the wrong request.
      if (parsePong(event.data)) {
        return;
      }

      const pending = pendingReplies.shift();
      const error = parseRuntimeError(event.data);
      if (error) {
        if (error.controlState && isCurrent()) {
          sessionId = error.controlState.session_id;
          setControlState(error.controlState);
        }
        pending?.reject(error.error);
        return;
      }

      const nextControlState = parseRuntimeControlState(event.data);
      if (nextControlState && isCurrent()) {
        sessionId = nextControlState.session_id;
        setControlState(nextControlState);
      }
      if (pending && !pending.settle(event.data)) {
        pending.reject(new Error("Bloom runtime WebSocket answered with an unexpected reply."));
      }
    });

    runtimeSocket.addEventListener("close", () => {
      clearInterval(keepaliveTimer);
      rejectPendingReplies(runtimeSocket, "Bloom runtime WebSocket closed before the runtime replied.");
      pendingRepliesBySocket.delete(runtimeSocket);
      if (!isCurrent()) {
        return;
      }
      socket = null;
      connectPromise = null;
      sessionId = "";
      setControlState(null);
      setLinkState("disconnected");
    });

    runtimeSocket.addEventListener("error", () => {
      clearInterval(keepaliveTimer);
      rejectPendingReplies(runtimeSocket, "Bloom runtime WebSocket failed before the runtime replied.");
    });
  }

  /** A reconnected socket is deployment-wide again until it is told which app it runs. */
  function sendAppContext(runtimeSocket: WebSocketLike): Promise<RuntimeAppContextResponse> | null {
    const pendingReplies = pendingRepliesBySocket.get(runtimeSocket);
    if (!appContext || !pendingReplies || appContextSocket === runtimeSocket) {
      return null;
    }
    const message = { type: "app_context", ...appContext };
    appContextSocket = runtimeSocket;
    appContextReply = new Promise<RuntimeAppContextResponse>((resolve, reject) => {
      pendingReplies.push({
        reject,
        settle: (data) => {
          const reply = parseAppContextAck(data);
          if (reply === null) {
            return false;
          }
          resolve(reply);
          return true;
        },
      });
      runtimeSocket.send(JSON.stringify(message));
    });
    // A resend nobody awaits still fails when the socket closes under it.
    void appContextReply.catch(() => undefined);
    return appContextReply;
  }

  /** Sent outside the reply queue: the lease keepalive must never be able to offset a teleop ack or a stop refusal. */
  function sendKeepalivePing(runtimeSocket: WebSocketLike) {
    if (!pendingRepliesBySocket.has(runtimeSocket) || runtimeSocket.readyState !== WebSocketCtor.OPEN) {
      return;
    }
    runtimeSocket.send(JSON.stringify({ type: "ping" }));
  }

  function rejectPendingReplies(runtimeSocket: WebSocketLike, message: string) {
    const pendingReplies = pendingRepliesBySocket.get(runtimeSocket) ?? [];
    for (const pending of pendingReplies.splice(0)) {
      pending.reject(new Error(message));
    }
  }

  async function request<T>(message: object, parseReply: (data: unknown) => T | null): Promise<T> {
    const runtimeSocket = await ensureConnected();
    const pendingReplies = pendingRepliesBySocket.get(runtimeSocket);
    if (!pendingReplies) {
      throw new Error("Bloom runtime WebSocket closed before the request was sent.");
    }
    return new Promise<T>((resolve, reject) => {
      pendingReplies.push({
        reject,
        settle: (data) => {
          const reply = parseReply(data);
          if (reply === null) {
            return false;
          }
          resolve(reply);
          return true;
        },
      });
      runtimeSocket.send(JSON.stringify(message));
    });
  }

  return {
    addRuntimeControlStateListener(listener: (state: RuntimeControlState | null) => void) {
      controlStateListeners.add(listener);
      listener(controlState);
      return () => {
        controlStateListeners.delete(listener);
      };
    },
    addRuntimeLinkStateListener(listener: (state: RuntimeLinkState) => void) {
      linkStateListeners.add(listener);
      // Deliver the current state immediately for late subscribers.
      listener(linkState);
      return () => {
        linkStateListeners.delete(listener);
      };
    },
    addRuntimeTopicSampleListener(listener: (sample: RuntimeTopicSampleMessage) => void) {
      topicSampleListeners.add(listener);
      return () => {
        topicSampleListeners.delete(listener);
      };
    },
    claimRuntimeControl() {
      return request({ type: "claim_control" }, parseRuntimeControlState);
    },
    disconnectRuntime() {
      socket?.close();
    },
    async ensureRuntimeConnected() {
      await ensureConnected();
    },
    getRuntimeSessionId() {
      return sessionId;
    },
    releaseRuntimeControl() {
      return request({ type: "release_control" }, parseRuntimeControlState);
    },
    sendTeleopCommand(teleopRequest: RuntimeTeleopCommandRequest): Promise<RuntimeTeleopCommandResponse> {
      return request(teleopRequest, parseTeleopAck);
    },
    async setRuntimeAppContext(context: RuntimeAppContextRequest): Promise<RuntimeAppContextResponse> {
      appContext = context;
      appContextSocket = null;
      appContextReply = null;
      // Connecting sends it as the socket opens; this call then awaits that reply.
      const runtimeSocket = await ensureConnected();
      return (
        sendAppContext(runtimeSocket) ??
        appContextReply ??
        Promise.reject(new Error("Bloom runtime WebSocket could not name the running app."))
      );
    },
    subscribeRuntimeTopic(subscription: RuntimeTopicSubscriptionRequest): Promise<RuntimeTopicSubscriptionResponse> {
      return request(subscription, parseTopicSubscriptionAck);
    },
    unsubscribeRuntimeTopic(
      subscription: RuntimeTopicUnsubscriptionRequest,
    ): Promise<RuntimeTopicUnsubscriptionResponse> {
      return request(subscription, parseTopicUnsubscriptionAck);
    },
  };
}

function parseRuntimeSessionConnected(data: unknown): RuntimeControlState | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as {
      active_sessions?: unknown;
      payload?: Partial<RuntimeControlState>;
      session_id?: unknown;
      type?: unknown;
    };
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
  } catch {
    return null;
  }
}

function parseRuntimeControlState(data: unknown): RuntimeControlState | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as {
      detail?: unknown;
      payload?: Partial<RuntimeControlState>;
      session_id?: unknown;
      type?: unknown;
    };
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
  } catch {
    return null;
  }
}

export function resolveRuntimeWebSocketUrl(
  apiBaseUrl: string,
  origin = globalThis.location?.origin ?? "",
  apiKey = "",
): string {
  const baseUrl = new URL(apiBaseUrl || origin || "http://localhost:8000", origin || "http://localhost:8000");
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = "/api/v1/runtime/ws";
  baseUrl.search = "";
  baseUrl.hash = "";
  // Only a key that cannot travel as a subprotocol falls back to the query, which access logs record.
  if (apiKey && !isSubprotocolToken(apiKey)) {
    baseUrl.searchParams.set("api_key", apiKey);
  }
  return baseUrl.toString();
}

/** A handshake takes no custom headers, but it does carry offered subprotocols. */
export function resolveRuntimeWebSocketProtocols(apiKey = ""): string[] | undefined {
  return apiKey && isSubprotocolToken(apiKey) ? ["bloom.runtime.v1", `bloom.api-key.${apiKey}`] : undefined;
}

function isSubprotocolToken(value: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}

function parseAppContextAck(data: unknown): RuntimeAppContextResponse | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<RuntimeAppContextResponse>;
    return parsed.type === "app_context_ack" && parsed.payload ? (parsed as RuntimeAppContextResponse) : null;
  } catch {
    return null;
  }
}

function parsePong(data: unknown): { type: "pong" } | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return (JSON.parse(data) as { type?: unknown }).type === "pong" ? { type: "pong" } : null;
  } catch {
    return null;
  }
}

function parseTeleopAck(data: unknown): RuntimeTeleopCommandResponse | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<RuntimeTeleopCommandResponse>;
    if (parsed.type !== "teleop_ack" || !parsed.payload) {
      return null;
    }
    return parsed as RuntimeTeleopCommandResponse;
  } catch {
    return null;
  }
}

function parseTopicSubscriptionAck(data: unknown): RuntimeTopicSubscriptionResponse | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<RuntimeTopicSubscriptionResponse>;
    if (parsed.type !== "subscription_ack" || !parsed.payload) {
      return null;
    }
    return parsed as RuntimeTopicSubscriptionResponse;
  } catch {
    return null;
  }
}

function parseTopicUnsubscriptionAck(data: unknown): RuntimeTopicUnsubscriptionResponse | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<RuntimeTopicUnsubscriptionResponse>;
    return parsed.type === "unsubscription_ack" && parsed.payload
      ? (parsed as RuntimeTopicUnsubscriptionResponse)
      : null;
  } catch {
    return null;
  }
}

function parseTopicSample(data: unknown): RuntimeTopicSampleMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<RuntimeTopicSampleMessage>;
    if (parsed.type !== "topic_sample" || !parsed.payload || typeof parsed.payload.topic !== "string") {
      return null;
    }
    return parsed as RuntimeTopicSampleMessage;
  } catch {
    return null;
  }
}

function parseRuntimeError(
  data: unknown,
): { code: string; controlState: RuntimeControlState | null; error: Error } | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as {
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
    };
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
  } catch {
    return null;
  }
}

function getDefaultWebSocketConstructor(): WebSocketConstructorLike {
  if (!globalThis.WebSocket) {
    throw new Error("WebSocket is not available in this environment.");
  }
  return globalThis.WebSocket;
}
