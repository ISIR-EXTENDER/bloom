import { describe, expect, it } from "vitest";
import {
  createRuntimeWebSocketClient,
  type RuntimeWebSocketClientOptions,
  resolveRuntimeWebSocketUrl,
} from "./runtime-websocket-client";

describe("runtime WebSocket client", () => {
  it("resolves runtime WebSocket URLs from API base URLs", () => {
    expect(resolveRuntimeWebSocketUrl("http://127.0.0.1:8000")).toBe("ws://127.0.0.1:8000/api/v1/runtime/ws");
    expect(resolveRuntimeWebSocketUrl("https://bloom.example.test")).toBe("wss://bloom.example.test/api/v1/runtime/ws");
  });

  it("sends teleop commands and resolves teleop ACKs", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({
      url: "ws://localhost:8000/api/v1/runtime/ws",
      WebSocketCtor,
    } satisfies RuntimeWebSocketClientOptions);
    const command = {
      type: "teleop_cmd" as const,
      angular: { x: 0, y: 0, z: 0 },
      linear: { x: 0.2, y: -0.1, z: 0 },
      mode: 3,
      seq: 4,
      target: "/teleop_cmd",
    };

    const responsePromise = client.sendTeleopCommand(command);
    const socket = WebSocketCtor.instances[0];
    socket.open();
    await flushPromises();
    socket.message({
      type: "session_connected",
      session_id: "runtime-session",
      detail: "Runtime session connected.",
    });
    socket.message({
      type: "teleop_ack",
      session_id: "runtime-session",
      detail: "Teleop command accepted.",
      payload: {
        angular: command.angular,
        linear: command.linear,
        mode: command.mode,
        seq: command.seq,
        status: "accepted",
        target: command.target,
      },
    });

    await expect(responsePromise).resolves.toMatchObject({
      detail: "Teleop command accepted.",
      payload: {
        mode: 3,
        status: "accepted",
        target: "/teleop_cmd",
      },
    });
    expect(socket.sentMessages).toEqual([JSON.stringify(command)]);
  });

  it("rejects pending teleop commands when the runtime returns an error", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({
      url: "ws://localhost:8000/api/v1/runtime/ws",
      WebSocketCtor,
    } satisfies RuntimeWebSocketClientOptions);
    const command = {
      type: "teleop_cmd" as const,
      angular: { x: 0, y: 0, z: 0 },
      linear: { x: 0.2, y: -0.1, z: 0 },
      mode: 3,
      seq: 4,
      target: "/teleop_cmd",
    };

    const responsePromise = client.sendTeleopCommand(command);
    const socket = WebSocketCtor.instances[0];
    socket.open();
    await flushPromises();
    socket.message({
      type: "runtime_error",
      session_id: "runtime-session",
      detail: "Teleop command could not be published.",
      payload: {
        message: "extender_msgs is required to publish teleop commands",
      },
    });

    await expect(responsePromise).rejects.toThrow(
      "Teleop command could not be published. extender_msgs is required to publish teleop commands",
    );
  });

  it("sends topic subscription requests and resolves subscription ACKs", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({
      url: "ws://localhost:8000/api/v1/runtime/ws",
      WebSocketCtor,
    } satisfies RuntimeWebSocketClientOptions);
    const request = {
      type: "subscribe_topic" as const,
      topic: "/sandbox_controller/velocity_command",
      message_type: "geometry_msgs/msg/TwistStamped",
      field_path: "twist.linear.x",
      widget_id: "velocity-plot",
    };

    const responsePromise = client.subscribeRuntimeTopic(request);
    const socket = WebSocketCtor.instances[0];
    socket.open();
    await flushPromises();
    socket.message({
      type: "subscription_ack",
      session_id: "runtime-session",
      detail: "Subscribed to /sandbox_controller/velocity_command.",
      payload: {
        topic: request.topic,
        message_type: request.message_type,
        field_path: request.field_path,
      },
    });

    await expect(responsePromise).resolves.toMatchObject({
      type: "subscription_ack",
      detail: "Subscribed to /sandbox_controller/velocity_command.",
      payload: {
        topic: "/sandbox_controller/velocity_command",
        field_path: "twist.linear.x",
      },
    });
    expect(socket.sentMessages).toEqual([JSON.stringify(request)]);
  });
});

function createFakeWebSocketConstructor() {
  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static instances: FakeWebSocket[] = [];

    readonly listeners: Record<string, Array<(event: Event | MessageEvent) => void>> = {};
    readonly sentMessages: string[] = [];
    readyState = FakeWebSocket.CONNECTING;

    constructor(readonly url: string) {
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
      this.listeners[type] = [...(this.listeners[type] ?? []), listener];
    }

    removeEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((candidate) => candidate !== listener);
    }

    close() {
      this.readyState = FakeWebSocket.CONNECTING;
      this.emit("close", new Event("close"));
    }

    send(data: string) {
      this.sentMessages.push(data);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open", new Event("open"));
    }

    message(data: unknown) {
      this.emit("message", new MessageEvent("message", { data: JSON.stringify(data) }));
    }

    private emit(type: string, event: Event | MessageEvent) {
      for (const listener of this.listeners[type] ?? []) {
        listener(event);
      }
    }
  }

  return FakeWebSocket;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
