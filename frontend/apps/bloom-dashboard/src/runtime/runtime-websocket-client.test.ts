import type { RuntimeControlState } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import type { RuntimeLinkState } from "./runtime-action-dispatcher";
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

  it("claims and releases explicit robot control for its server session", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({ url: "ws://localhost:8000/api/v1/runtime/ws", WebSocketCtor });
    const states: Array<RuntimeControlState | null> = [];
    client.addRuntimeControlStateListener((state) => states.push(state));

    const claim = client.claimRuntimeControl();
    const socket = WebSocketCtor.instances[0];
    socket.open();
    await flushPromises();
    socket.message({
      active_sessions: 1,
      payload: {
        active_sessions: 1,
        is_owner: false,
        owner_present: false,
        session_id: "runtime-session",
      },
      session_id: "runtime-session",
      type: "session_connected",
    });
    expect(client.getRuntimeSessionId()).toBe("runtime-session");
    expect(socket.sentMessages).toEqual([JSON.stringify({ type: "claim_control" })]);

    const owned = {
      active_sessions: 1,
      detail: "This runtime session owns robot control.",
      is_owner: true,
      owner_present: true,
      session_id: "runtime-session",
    };
    socket.message({ type: "control_state", detail: owned.detail, payload: owned, session_id: "runtime-session" });
    await expect(claim).resolves.toEqual(owned);

    const release = client.releaseRuntimeControl();
    await flushPromises();
    expect(socket.sentMessages.at(-1)).toBe(JSON.stringify({ type: "release_control" }));
    const released = {
      ...owned,
      detail: "No runtime session owns robot control.",
      is_owner: false,
      owner_present: false,
    };
    socket.message({
      type: "control_state",
      detail: released.detail,
      payload: released,
      session_id: "runtime-session",
    });
    await expect(release).resolves.toEqual(released);
    expect(states).toEqual([null, expect.objectContaining({ is_owner: false }), owned, released]);
  });

  it("clears local ownership when release fails after the server latches STOP", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({ url: "ws://localhost:8000/api/v1/runtime/ws", WebSocketCtor });
    const states: Array<RuntimeControlState | null> = [];
    client.addRuntimeControlStateListener((state) => states.push(state));

    const release = client.releaseRuntimeControl();
    const socket = WebSocketCtor.instances[0];
    socket.open();
    socket.message({
      active_sessions: 1,
      payload: {
        active_sessions: 1,
        is_owner: true,
        owner_present: true,
        session_id: "runtime-session",
      },
      session_id: "runtime-session",
      type: "session_connected",
    });
    await flushPromises();

    socket.message({
      detail: "Robot control could not be released safely.",
      payload: {
        active_sessions: 1,
        code: "control_release_failed",
        is_owner: false,
        message: "neutral command could not reach ROS",
        owner_present: false,
        session_id: "runtime-session",
      },
      session_id: "runtime-session",
      type: "runtime_error",
    });

    await expect(release).rejects.toThrow("Robot control could not be released safely.");
    expect(states.at(-1)).toMatchObject({ is_owner: false, owner_present: false });
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
      topic: "/cartesian_command",
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
      detail: "Subscribed to /cartesian_command.",
      payload: {
        topic: request.topic,
        message_type: request.message_type,
        field_path: request.field_path,
      },
    });

    await expect(responsePromise).resolves.toMatchObject({
      type: "subscription_ack",
      detail: "Subscribed to /cartesian_command.",
      payload: {
        topic: "/cartesian_command",
        field_path: "twist.linear.x",
      },
    });
    expect(socket.sentMessages).toEqual([JSON.stringify(request)]);
  });

  it("notifies topic sample listeners", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const receivedSamples: unknown[] = [];
    const client = createRuntimeWebSocketClient({
      url: "ws://localhost:8000/api/v1/runtime/ws",
      WebSocketCtor,
    } satisfies RuntimeWebSocketClientOptions);
    client.addRuntimeTopicSampleListener((sample) => receivedSamples.push(sample));

    const responsePromise = client.subscribeRuntimeTopic({
      type: "subscribe_topic",
      field_path: "data",
      message_type: "std_msgs/msg/Float64",
      topic: "/cmd/max_velocity",
      widget_id: "max-velocity-plot",
    });
    const socket = WebSocketCtor.instances[0];
    socket.open();
    await flushPromises();
    socket.message({
      type: "subscription_ack",
      session_id: "runtime-session",
      detail: "Subscribed to /cmd/max_velocity.",
      payload: {
        topic: "/cmd/max_velocity",
        message_type: "std_msgs/msg/Float64",
        field_path: "data",
      },
    });
    await responsePromise;

    socket.message({
      type: "topic_sample",
      session_id: "runtime-session",
      detail: "Received /cmd/max_velocity.",
      payload: {
        topic: "/cmd/max_velocity",
        message_type: "std_msgs/msg/Float64",
        received_at: "2026-06-03T10:00:00+00:00",
        value: { data: 0.5 },
      },
    });

    expect(receivedSamples).toEqual([
      {
        type: "topic_sample",
        session_id: "runtime-session",
        detail: "Received /cmd/max_velocity.",
        payload: {
          topic: "/cmd/max_velocity",
          message_type: "std_msgs/msg/Float64",
          received_at: "2026-06-03T10:00:00+00:00",
          value: { data: 0.5 },
        },
      },
    ]);
  });
});

describe("the runtime link state", () => {
  it("reports the connection settling open", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({ url: "ws://localhost:8000/api/v1/runtime/ws", WebSocketCtor });
    const states: RuntimeLinkState[] = [];
    client.addRuntimeLinkStateListener((state) => states.push(state));

    const connected = client.ensureRuntimeConnected();
    WebSocketCtor.instances[0].open();
    await connected;

    expect(states).toEqual(["connecting", "connected"]);
  });

  it("reports a dead link the moment the socket closes", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({ url: "ws://localhost:8000/api/v1/runtime/ws", WebSocketCtor });
    const states: RuntimeLinkState[] = [];
    client.addRuntimeLinkStateListener((state) => states.push(state));
    const connected = client.ensureRuntimeConnected();
    WebSocketCtor.instances[0].open();
    await connected;

    WebSocketCtor.instances[0].close();

    expect(states).toEqual(["connecting", "connected", "disconnected"]);
    expect(client.getRuntimeSessionId()).toBe("");
  });

  it("hands a late subscriber the current state instead of silence", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({ url: "ws://localhost:8000/api/v1/runtime/ws", WebSocketCtor });
    const connected = client.ensureRuntimeConnected();
    WebSocketCtor.instances[0].open();
    await connected;
    WebSocketCtor.instances[0].close();

    const states: RuntimeLinkState[] = [];
    client.addRuntimeLinkStateListener((state) => states.push(state));

    expect(states).toEqual(["disconnected"]);
  });

  it("reports a connection that never opened as disconnected", async () => {
    const WebSocketCtor = createFakeWebSocketConstructor();
    const client = createRuntimeWebSocketClient({ url: "ws://localhost:8000/api/v1/runtime/ws", WebSocketCtor });
    const states: RuntimeLinkState[] = [];
    client.addRuntimeLinkStateListener((state) => states.push(state));

    const connected = client.ensureRuntimeConnected();
    WebSocketCtor.instances[0].close();

    await expect(connected).rejects.toThrow("Bloom runtime WebSocket could not connect.");
    expect(states).toEqual(["connecting", "disconnected"]);
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
