import type { RuntimeControlState } from "@bloom/api-client";
import type {
  RuntimeActionClient,
  RuntimeLinkState,
  RuntimeTeleopCommandRequest,
  RuntimeTeleopCommandResponse,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionRequest,
  RuntimeTopicSubscriptionResponse,
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
  new (url: string): WebSocketLike;
};

type PendingTeleopAck = {
  reject: (error: Error) => void;
  resolve: (response: RuntimeTeleopCommandResponse) => void;
};

type PendingTopicSubscriptionAck = {
  reject: (error: Error) => void;
  resolve: (response: RuntimeTopicSubscriptionResponse) => void;
};

type PendingControlAck = {
  reject: (error: Error) => void;
  resolve: (response: RuntimeControlState) => void;
};

export type RuntimeWebSocketClientOptions = {
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
    | "subscribeRuntimeTopic"
  >
> {
  const WebSocketCtor = options.WebSocketCtor ?? getDefaultWebSocketConstructor();
  let socket: WebSocketLike | null = null;
  let connectPromise: Promise<WebSocketLike> | null = null;
  let linkState: RuntimeLinkState = "connecting";
  let controlState: RuntimeControlState | null = null;
  let sessionId = "";
  const pendingControlAcks: PendingControlAck[] = [];
  const pendingTeleopAcks: PendingTeleopAck[] = [];
  const pendingTopicSubscriptionAcks: PendingTopicSubscriptionAck[] = [];
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

    socket = new WebSocketCtor(options.url);
    setLinkState("connecting");
    connectPromise = new Promise((resolve, reject) => {
      const handleOpen = () => {
        removeConnectionListeners();
        bindRuntimeListeners(socket as WebSocketLike);
        setLinkState("connected");
        resolve(socket as WebSocketLike);
      };
      const handleFailure = () => {
        removeConnectionListeners();
        setLinkState("disconnected");
        reject(new Error("Bloom runtime WebSocket could not connect."));
      };
      const removeConnectionListeners = () => {
        socket?.removeEventListener("open", handleOpen);
        socket?.removeEventListener("close", handleFailure);
        socket?.removeEventListener("error", handleFailure);
      };

      socket?.addEventListener("open", handleOpen);
      socket?.addEventListener("close", handleFailure);
      socket?.addEventListener("error", handleFailure);
    });
    return connectPromise;
  }

  function bindRuntimeListeners(runtimeSocket: WebSocketLike) {
    runtimeSocket.addEventListener("message", (event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      const connectedState = parseRuntimeSessionConnected(event.data);
      if (connectedState) {
        sessionId = connectedState.session_id;
        setControlState(connectedState);
        return;
      }

      const error = parseRuntimeError(event.data);
      if (error) {
        if (error.controlState) {
          sessionId = error.controlState.session_id;
          setControlState(error.controlState);
        }
        rejectNextPendingAck(error.error, error.code);
        return;
      }

      const nextControlState = parseRuntimeControlState(event.data);
      if (nextControlState) {
        sessionId = nextControlState.session_id;
        setControlState(nextControlState);
        pendingControlAcks.shift()?.resolve(nextControlState);
        return;
      }

      const response = parseTeleopAck(event.data);
      if (response) {
        pendingTeleopAcks.shift()?.resolve(response);
        return;
      }

      const subscriptionResponse = parseTopicSubscriptionAck(event.data);
      if (subscriptionResponse) {
        pendingTopicSubscriptionAcks.shift()?.resolve(subscriptionResponse);
        return;
      }

      const topicSample = parseTopicSample(event.data);
      if (topicSample) {
        for (const listener of topicSampleListeners) {
          listener(topicSample);
        }
      }
    });

    runtimeSocket.addEventListener("close", () => {
      rejectPendingTeleopAcks("Bloom runtime WebSocket closed before a teleop ACK was received.");
      rejectPendingTopicSubscriptionAcks(
        "Bloom runtime WebSocket closed before a topic subscription ACK was received.",
      );
      rejectPendingControlAcks("Bloom runtime WebSocket closed before control ownership was acknowledged.");
      socket = null;
      connectPromise = null;
      sessionId = "";
      setControlState(null);
      setLinkState("disconnected");
    });

    runtimeSocket.addEventListener("error", () => {
      rejectPendingTeleopAcks("Bloom runtime WebSocket failed while waiting for a teleop ACK.");
      rejectPendingTopicSubscriptionAcks("Bloom runtime WebSocket failed while waiting for a topic subscription ACK.");
      rejectPendingControlAcks("Bloom runtime WebSocket failed while changing control ownership.");
    });
  }

  function rejectNextPendingAck(error: Error, code = "") {
    if (code === "control_release_failed") {
      pendingControlAcks.shift()?.reject(error);
      return;
    }
    const pendingTeleopAck = pendingTeleopAcks.shift();
    if (pendingTeleopAck) {
      pendingTeleopAck.reject(error);
      return;
    }
    const pendingTopicSubscriptionAck = pendingTopicSubscriptionAcks.shift();
    if (pendingTopicSubscriptionAck) {
      pendingTopicSubscriptionAck.reject(error);
      return;
    }
    pendingControlAcks.shift()?.reject(error);
  }

  function rejectPendingTeleopAcks(message: string) {
    while (pendingTeleopAcks.length > 0) {
      pendingTeleopAcks.shift()?.reject(new Error(message));
    }
  }

  function rejectPendingTopicSubscriptionAcks(message: string) {
    while (pendingTopicSubscriptionAcks.length > 0) {
      pendingTopicSubscriptionAcks.shift()?.reject(new Error(message));
    }
  }

  function rejectPendingControlAcks(message: string) {
    while (pendingControlAcks.length > 0) {
      pendingControlAcks.shift()?.reject(new Error(message));
    }
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
    async claimRuntimeControl() {
      const runtimeSocket = await ensureConnected();
      return new Promise((resolve, reject) => {
        pendingControlAcks.push({ resolve, reject });
        runtimeSocket.send(JSON.stringify({ type: "claim_control" }));
      });
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
    async releaseRuntimeControl() {
      const runtimeSocket = await ensureConnected();
      return new Promise((resolve, reject) => {
        pendingControlAcks.push({ resolve, reject });
        runtimeSocket.send(JSON.stringify({ type: "release_control" }));
      });
    },
    async sendTeleopCommand(request: RuntimeTeleopCommandRequest): Promise<RuntimeTeleopCommandResponse> {
      const runtimeSocket = await ensureConnected();
      return new Promise((resolve, reject) => {
        pendingTeleopAcks.push({ resolve, reject });
        runtimeSocket.send(JSON.stringify(request));
      });
    },
    async subscribeRuntimeTopic(request: RuntimeTopicSubscriptionRequest): Promise<RuntimeTopicSubscriptionResponse> {
      const runtimeSocket = await ensureConnected();
      return new Promise((resolve, reject) => {
        pendingTopicSubscriptionAcks.push({ resolve, reject });
        runtimeSocket.send(JSON.stringify(request));
      });
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
  // A WebSocket handshake carries no custom headers, so an authenticated
  // deployment passes the key the only way the browser allows.
  if (apiKey) {
    baseUrl.searchParams.set("api_key", apiKey);
  }
  return baseUrl.toString();
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
