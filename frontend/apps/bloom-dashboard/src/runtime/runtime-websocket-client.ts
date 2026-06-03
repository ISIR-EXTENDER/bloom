import type {
  RuntimeActionClient,
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

export type RuntimeWebSocketClientOptions = {
  url: string;
  WebSocketCtor?: WebSocketConstructorLike;
};

export function createRuntimeWebSocketClient(
  options: RuntimeWebSocketClientOptions,
): Required<
  Pick<RuntimeActionClient, "addRuntimeTopicSampleListener" | "sendTeleopCommand" | "subscribeRuntimeTopic">
> {
  const WebSocketCtor = options.WebSocketCtor ?? getDefaultWebSocketConstructor();
  let socket: WebSocketLike | null = null;
  let connectPromise: Promise<WebSocketLike> | null = null;
  const pendingTeleopAcks: PendingTeleopAck[] = [];
  const pendingTopicSubscriptionAcks: PendingTopicSubscriptionAck[] = [];
  const topicSampleListeners = new Set<(sample: RuntimeTopicSampleMessage) => void>();

  async function ensureConnected(): Promise<WebSocketLike> {
    if (socket?.readyState === WebSocketCtor.OPEN) {
      return socket;
    }
    if (socket?.readyState === WebSocketCtor.CONNECTING && connectPromise) {
      return connectPromise;
    }

    socket = new WebSocketCtor(options.url);
    connectPromise = new Promise((resolve, reject) => {
      const handleOpen = () => {
        removeConnectionListeners();
        bindRuntimeListeners(socket as WebSocketLike);
        resolve(socket as WebSocketLike);
      };
      const handleFailure = () => {
        removeConnectionListeners();
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

      const error = parseRuntimeError(event.data);
      if (error) {
        rejectNextPendingAck(error);
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
      socket = null;
      connectPromise = null;
    });

    runtimeSocket.addEventListener("error", () => {
      rejectPendingTeleopAcks("Bloom runtime WebSocket failed while waiting for a teleop ACK.");
      rejectPendingTopicSubscriptionAcks("Bloom runtime WebSocket failed while waiting for a topic subscription ACK.");
    });
  }

  function rejectNextPendingAck(error: Error) {
    const pendingTeleopAck = pendingTeleopAcks.shift();
    if (pendingTeleopAck) {
      pendingTeleopAck.reject(error);
      return;
    }
    pendingTopicSubscriptionAcks.shift()?.reject(error);
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

  return {
    addRuntimeTopicSampleListener(listener: (sample: RuntimeTopicSampleMessage) => void) {
      topicSampleListeners.add(listener);
      return () => {
        topicSampleListeners.delete(listener);
      };
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

export function resolveRuntimeWebSocketUrl(apiBaseUrl: string, origin = globalThis.location?.origin ?? ""): string {
  const baseUrl = new URL(apiBaseUrl || origin || "http://localhost:8000", origin || "http://localhost:8000");
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = "/api/v1/runtime/ws";
  baseUrl.search = "";
  baseUrl.hash = "";
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

function parseRuntimeError(data: unknown): Error | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as { detail?: unknown; payload?: { message?: unknown }; type?: unknown };
    if (parsed.type !== "runtime_error") {
      return null;
    }
    const payloadMessage = typeof parsed.payload?.message === "string" ? parsed.payload.message : undefined;
    const detail = typeof parsed.detail === "string" ? parsed.detail : "Runtime command failed.";
    return new Error(payloadMessage ? `${detail} ${payloadMessage}` : detail);
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
