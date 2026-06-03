import type {
  RuntimeActionClient,
  RuntimeTeleopCommandRequest,
  RuntimeTeleopCommandResponse,
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

export type RuntimeWebSocketClientOptions = {
  url: string;
  WebSocketCtor?: WebSocketConstructorLike;
};

export function createRuntimeWebSocketClient(
  options: RuntimeWebSocketClientOptions,
): Required<Pick<RuntimeActionClient, "sendTeleopCommand">> {
  const WebSocketCtor = options.WebSocketCtor ?? getDefaultWebSocketConstructor();
  let socket: WebSocketLike | null = null;
  let connectPromise: Promise<WebSocketLike> | null = null;
  const pendingTeleopAcks: PendingTeleopAck[] = [];

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
        pendingTeleopAcks.shift()?.reject(error);
        return;
      }

      const response = parseTeleopAck(event.data);
      if (!response) {
        return;
      }
      pendingTeleopAcks.shift()?.resolve(response);
    });

    runtimeSocket.addEventListener("close", () => {
      rejectPendingTeleopAcks("Bloom runtime WebSocket closed before a teleop ACK was received.");
      socket = null;
      connectPromise = null;
    });

    runtimeSocket.addEventListener("error", () => {
      rejectPendingTeleopAcks("Bloom runtime WebSocket failed while waiting for a teleop ACK.");
    });
  }

  function rejectPendingTeleopAcks(message: string) {
    while (pendingTeleopAcks.length > 0) {
      pendingTeleopAcks.shift()?.reject(new Error(message));
    }
  }

  return {
    async sendTeleopCommand(request: RuntimeTeleopCommandRequest): Promise<RuntimeTeleopCommandResponse> {
      const runtimeSocket = await ensureConnected();
      return new Promise((resolve, reject) => {
        pendingTeleopAcks.push({ resolve, reject });
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
