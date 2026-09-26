import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";
import { TeleopTwistComposer } from "./teleop-composition";
import { TeleopStreamPump } from "./teleop-stream";

function widgetRequest(overrides: Partial<RuntimeTeleopCommandRequest> = {}): RuntimeTeleopCommandRequest {
  return {
    type: "teleop_cmd",
    angular: { x: 0, y: 0, z: 0 },
    linear: { x: 0, y: 0, z: 0.5 },
    mode: 0,
    seq: 1,
    target: "/joystick_cartesian_command",
    ...overrides,
  };
}

describe("the teleop stream pump", () => {
  let composer: TeleopTwistComposer;
  let sent: RuntimeTeleopCommandRequest[];
  let sequence: number;

  const createPump = (send?: (request: RuntimeTeleopCommandRequest) => Promise<unknown>) =>
    new TeleopStreamPump({
      composer,
      nextSequence: () => ++sequence,
      send:
        send ??
        ((request) => {
          sent.push(request);
          return Promise.resolve();
        }),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    composer = new TeleopTwistComposer();
    sent = [];
    sequence = 100;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a held slider's command alive past the manager timeout", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    const pump = createPump();

    pump.noteDispatched(widgetRequest(), "sent");
    await vi.advanceTimersByTimeAsync(210);

    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(sent[0]).toMatchObject({
      linear: { x: 0, y: 0, z: 0.5 },
      mode: 0,
      target: "/joystick_cartesian_command",
    });
    expect(new Set(sent.map((request) => request.seq)).size).toBe(sent.length);
    pump.stop();
  });

  it("carries every engaged widget's contribution, not just the mover's", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    composer.contribute("drive-rz", { angular_z: -0.3 });
    const pump = createPump();

    pump.noteDispatched(widgetRequest(), "sent");
    await vi.advanceTimersByTimeAsync(60);

    expect(sent.at(-1)).toMatchObject({
      angular: { x: 0, y: 0, z: -0.3 },
      linear: { x: 0, y: 0, z: 0.5 },
    });
    pump.stop();
  });

  it("defers to a widget that is already streaming", async () => {
    composer.contribute("stick", { linear_x: 0.4 });
    const pump = createPump();

    for (let elapsed = 0; elapsed < 300; elapsed += 30) {
      pump.noteDispatched(widgetRequest(), "sent");
      await vi.advanceTimersByTimeAsync(30);
    }

    expect(sent).toHaveLength(0);
    pump.stop();
  });

  it("sends a short explicit-zero tail after release, then goes quiet", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    const pump = createPump();
    pump.noteDispatched(widgetRequest(), "sent");
    await vi.advanceTimersByTimeAsync(110);
    const movingSends = sent.length;

    composer.contribute("drive-z", { linear_z: 0 });
    await vi.advanceTimersByTimeAsync(2000);

    const zeroSends = sent.slice(movingSends);
    expect(zeroSends.length).toBe(6);
    for (const request of zeroSends) {
      expect(request.linear).toEqual({ x: 0, y: 0, z: 0 });
      expect(request.angular).toEqual({ x: 0, y: 0, z: 0 });
    }
    pump.stop();
  });

  it("backs off a refused tick, gives up after a few, and restarts on the next dispatch", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    let attempts = 0;
    const onGiveUp = vi.fn();
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => ++sequence,
      onGiveUp,
      send: () => {
        attempts += 1;
        return Promise.reject(new Error("Teleop command was rejected: runtime stop is engaged."));
      },
    });

    pump.noteDispatched(widgetRequest(), "sent");
    await vi.advanceTimersByTimeAsync(3000);
    expect(attempts).toBe(4);
    expect(onGiveUp).toHaveBeenCalledTimes(1);

    pump.noteDispatched(widgetRequest(), "sent");
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBeGreaterThan(4);
    pump.stop();
  });

  it("keeps streaming a held value after one transient refusal", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    let attempts = 0;
    const pump = createPump((request) => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("Too many requests."));
      }
      sent.push(request);
      return Promise.resolve();
    });

    pump.noteDispatched(widgetRequest(), "sent");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sent.length).toBeGreaterThan(5);
    expect(sent.at(-1)?.linear.z).toBe(0.5);
    pump.stop();
  });

  it("ends a suspend with a zero even when no move was acknowledged yet", async () => {
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => ++sequence,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
      unsettledMoves: () => [{ frame_id: "base_link", mode: 2, target: "/custom_teleop" }],
    });

    await pump.suspend();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      angular: { x: 0, y: 0, z: 0 },
      linear: { x: 0, y: 0, z: 0 },
      mode: 2,
      target: "/custom_teleop",
    });
  });

  it("ends a suspend with a zero on every target moved since the last zero", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    const pump = createPump();
    pump.noteDispatched(widgetRequest({ target: "/arm_a/cartesian_command" }), "sent");
    pump.noteDispatched(widgetRequest({ target: "/arm_b/cartesian_command" }), "sent");
    pump.noteDispatched(widgetRequest({ linear: { x: 0, y: 0, z: 0 }, target: "/arm_c/cartesian_command" }), "sent");
    pump.noteDispatched(widgetRequest({ linear: { x: 0, y: 0, z: 0 }, target: "/arm_b/cartesian_command" }), "sent");
    pump.noteDispatched(widgetRequest({ target: "/arm_c/cartesian_command" }), "sent");
    pump.stop();
    sent = [];

    composer.clear();
    await pump.suspend();

    expect(sent.map((request) => request.target).sort()).toEqual([
      "/arm_a/cartesian_command",
      "/arm_c/cartesian_command",
    ]);
    expect(sent.every((request) => request.linear.z === 0)).toBe(true);
  });

  it("never streams a frame the robot does not allow", async () => {
    composer.contribute("drive-rz", { angular_z: 0.4 }, "ft_frame");
    const pump = new TeleopStreamPump({
      allowedFrameIds: () => ["base_link"],
      composer,
      nextSequence: () => ++sequence,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });

    pump.noteDispatched(widgetRequest({ frame_id: "base_link" }), "sent", "base_link");
    await vi.advanceTimersByTimeAsync(120);
    composer.clear();
    await pump.suspend();

    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((request) => request.frame_id === "base_link")).toBe(true);
  });

  it("keeps the dispatched rotation frame in every heartbeat", async () => {
    composer.contribute("drive-rz", { angular_z: 0.4 });
    const pump = createPump();

    pump.noteDispatched(widgetRequest({ frame_id: "ft_frame" }), "sent");
    await vi.advanceTimersByTimeAsync(60);

    expect(sent.at(-1)).toMatchObject({ frame_id: "ft_frame" });
    pump.stop();
  });

  it("never starts for a dispatch that already failed", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    const pump = createPump();

    pump.noteDispatched(widgetRequest(), "failed");
    await vi.advanceTimersByTimeAsync(1000);

    expect(sent).toHaveLength(0);
  });

  it("sends a final zero before the operating surface is suspended", async () => {
    composer.contribute("drive-z", { linear_z: 0.5 });
    const pump = createPump();
    pump.noteDispatched(widgetRequest({ frame_id: "base_link", mode: 2 }), "sent");
    await vi.advanceTimersByTimeAsync(60);
    const sentBeforeReset = sent.length;

    composer.clear();
    await pump.suspend();
    await vi.advanceTimersByTimeAsync(1000);

    expect(sent).toHaveLength(sentBeforeReset + 1);
    expect(sent.at(-1)).toMatchObject({
      angular: { x: 0, y: 0, z: 0 },
      frame_id: "base_link",
      linear: { x: 0, y: 0, z: 0 },
      mode: 2,
      target: "/joystick_cartesian_command",
    });
  });
});

describe("a pump driving two teleop targets", () => {
  let composer: TeleopTwistComposer;
  let sent: RuntimeTeleopCommandRequest[];

  beforeEach(() => {
    vi.useFakeTimers();
    composer = new TeleopTwistComposer();
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  it("streams each target its own composition and zeroes both on suspend", async () => {
    let sequence = 0;
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => ++sequence,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });
    composer.contribute("pad-a", { linear_x: 0.6 }, "", "/joystick_cartesian_command");
    composer.contribute("pad-b", { linear_y: 0.4 }, "", "/visual_servoing_command");
    pump.noteDispatched(widgetRequest({ linear: { x: 0.6, y: 0, z: 0 } }), "sent");
    pump.noteDispatched(widgetRequest({ linear: { x: 0, y: 0.4, z: 0 }, target: "/visual_servoing_command" }), "sent");
    await vi.advanceTimersByTimeAsync(120);

    const last = (target: string) => sent.filter((request) => request.target === target).at(-1);
    expect(last("/joystick_cartesian_command")?.linear).toEqual({ x: 0.6, y: 0, z: 0 });
    expect(last("/visual_servoing_command")?.linear).toEqual({ x: 0, y: 0.4, z: 0 });

    composer.release("pad-a");
    await vi.advanceTimersByTimeAsync(120);
    expect(last("/joystick_cartesian_command")?.linear).toEqual({ x: 0, y: 0, z: 0 });
    expect(last("/visual_servoing_command")?.linear).toEqual({ x: 0, y: 0.4, z: 0 });

    composer.clear();
    sent = [];
    await pump.suspend();
    expect(sent.map((request) => request.target).sort()).toEqual([
      "/joystick_cartesian_command",
      "/visual_servoing_command",
    ]);
    expect(sent.every((request) => request.linear.y === 0 && request.linear.x === 0)).toBe(true);
  });

  it("streams the legacy topic with the mode of what is actually held", async () => {
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => 1,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });
    composer.contribute("move", { linear_x: 0.5 }, "", "/teleop_cmd");
    composer.contribute("turn", { angular_x: 0.3 }, "", "/teleop_cmd");
    pump.noteDispatched(widgetRequest({ mode: 1, target: "/teleop_cmd" }), "sent");
    await vi.advanceTimersByTimeAsync(60);

    expect(sent.at(-1)).toMatchObject({ mode: 3, target: "/teleop_cmd" });
    pump.stop();
  });
});

describe("a non-widget source", () => {
  let composer: TeleopTwistComposer;
  let sent: RuntimeTeleopCommandRequest[];

  beforeEach(() => {
    vi.useFakeTimers();
    composer = new TeleopTwistComposer();
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  it("streams through the pump without a dispatched request of its own", async () => {
    // A gamepad carries no widget intent; the pump adopts the default target.
    composer.contribute("gamepad", { linear_x: 0.6 });
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => 1,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });

    pump.noteExternalContribution({ frame_id: "hybrid_frame", mode: 0, target: "/joystick_cartesian_command" });
    await vi.advanceTimersByTimeAsync(120);

    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]).toMatchObject({ linear: { x: 0.6, y: 0, z: 0 }, target: "/joystick_cartesian_command" });
    pump.stop();
  });

  it("stamps a physical gamepad with the app's command frame", async () => {
    composer.contribute("gamepad", { angular_z: 0.4 });
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => 1,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });

    pump.noteExternalContribution({
      frame_id: "hybrid_frame",
      mode: 0,
      target: "/joystick_cartesian_command",
    });
    await vi.advanceTimersByTimeAsync(120);

    expect(sent[0]).toMatchObject({ frame_id: "hybrid_frame" });
    pump.stop();
  });

  it("follows the target a widget already established", async () => {
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => 1,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });

    pump.noteDispatched(widgetRequest({ target: "/custom_teleop", mode: 3 }), "sent");
    const target = pump.externalTarget("/joystick_cartesian_command");
    composer.contribute("gamepad", { linear_x: 0.6 }, "", target);
    pump.noteExternalContribution({ frame_id: "hybrid_frame", mode: 0, target });
    await vi.advanceTimersByTimeAsync(120);

    expect(sent.at(-1)).toMatchObject({ frame_id: "hybrid_frame", mode: 3, target: "/custom_teleop" });
    pump.stop();
  });

  it("keeps a pad's own rotation frame while a gamepad streams beside it", async () => {
    composer.contribute("rotation-pad", { angular_z: 0.4 }, "effector_frame");
    composer.contribute("gamepad", { linear_x: 0.6 });
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => 1,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });

    pump.noteDispatched(widgetRequest({ frame_id: "effector_frame" }), "sent");
    pump.noteExternalContribution({ frame_id: "base_link", mode: 0, target: "/joystick_cartesian_command" });
    await vi.advanceTimersByTimeAsync(120);

    expect(sent.at(-1)).toMatchObject({ angular: { z: 0.4 }, frame_id: "effector_frame" });

    composer.release("rotation-pad");
    await vi.advanceTimersByTimeAsync(120);
    expect(sent.at(-1)).toMatchObject({ frame_id: "base_link" });
    pump.stop();
  });

  it("keeps a widget frame until the external source resolves its own", async () => {
    composer.contribute("gamepad", { linear_x: 0.6 });
    const pump = new TeleopStreamPump({
      composer,
      nextSequence: () => 1,
      send: (request) => {
        sent.push(request);
        return Promise.resolve();
      },
    });

    pump.noteDispatched(widgetRequest({ frame_id: "ft_frame" }), "sent");
    pump.noteExternalContribution({ mode: 0, target: "/joystick_cartesian_command" });
    await vi.advanceTimersByTimeAsync(120);

    expect(sent.at(-1)).toMatchObject({ frame_id: "ft_frame" });
    pump.stop();
  });
});
