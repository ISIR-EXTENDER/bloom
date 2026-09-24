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
import {
  parseAppContextAck,
  parsePong,
  parseRuntimeControlState,
  parseRuntimeError,
  parseRuntimeSessionConnected,
  parseTeleopAck,
  parseTopicSample,
  parseTopicSubscriptionAck,
  parseTopicUnsubscriptionAck,
} from "./runtime-frames";
import { resolveWebSocketProtocols, resolveWebSocketUrl } from "./websocket-url";

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

export function resolveRuntimeWebSocketUrl(apiBaseUrl: string, origin?: string, apiKey = ""): string {
  return resolveWebSocketUrl(apiBaseUrl, "/api/v1/runtime/ws", { apiKey, origin });
}

export const resolveRuntimeWebSocketProtocols = resolveWebSocketProtocols;

function getDefaultWebSocketConstructor(): WebSocketConstructorLike {
  if (!globalThis.WebSocket) {
    throw new Error("WebSocket is not available in this environment.");
  }
  return globalThis.WebSocket;
}
