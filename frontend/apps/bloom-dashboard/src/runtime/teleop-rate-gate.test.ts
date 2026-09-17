import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeTeleopCommandRequest, RuntimeTeleopCommandResponse } from "./runtime-action-dispatcher";
import { TeleopRateGate } from "./teleop-rate-gate";

function command(seq: number, linearX = seq / 100): RuntimeTeleopCommandRequest {
  return {
    type: "teleop_cmd",
    angular: { x: 0, y: 0, z: 0 },
    linear: { x: linearX, y: 0, z: 0 },
    mode: 0,
    seq,
    target: "/joystick_cartesian_command",
  };
}

function accepted(request: RuntimeTeleopCommandRequest): RuntimeTeleopCommandResponse {
  return {
    type: "teleop_ack",
    detail: "Accepted.",
    payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" },
  };
}

describe("the aggregate teleop rate gate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst to the first and latest commands", async () => {
    const sent: RuntimeTeleopCommandRequest[] = [];
    const gate = new TeleopRateGate({
      send: async (request) => {
        sent.push(request);
        return accepted(request);
      },
    });

    const first = gate.submit(command(1));
    const superseded = gate.submit(command(2));
    const latest = gate.submit(command(3));

    await expect(first).resolves.toMatchObject({ status: "accepted" });
    await expect(superseded).resolves.toMatchObject({ status: "coalesced" });
    await vi.advanceTimersByTimeAsync(34);
    await expect(latest).resolves.toMatchObject({ status: "accepted" });
    expect(sent.map((request) => request.seq)).toEqual([1, 3]);
  });

  it("holds sustained input to at most 30 moving commands in any second", async () => {
    const sentAt: number[] = [];
    const sent: RuntimeTeleopCommandRequest[] = [];
    const gate = new TeleopRateGate({
      send: async (request) => {
        sentAt.push(Date.now());
        sent.push(request);
        return accepted(request);
      },
    });
    const outcomes: Promise<unknown>[] = [];

    for (let seq = 1; seq <= 100; seq += 1) {
      outcomes.push(gate.submit(command(seq)));
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(outcomes);

    for (const start of sentAt) {
      expect(sentAt.filter((time) => time >= start && time < start + 1000).length).toBeLessThanOrEqual(30);
    }
    expect(sent.at(-1)?.seq).toBe(100);
  });

  it("sends neutral immediately and discards a queued moving command", async () => {
    const sent: RuntimeTeleopCommandRequest[] = [];
    const gate = new TeleopRateGate({
      send: async (request) => {
        sent.push(request);
        return accepted(request);
      },
    });

    await gate.submit(command(1));
    const staleMove = gate.submit(command(2));
    const zero = gate.submit(command(3, 0));

    await expect(staleMove).resolves.toMatchObject({ status: "coalesced" });
    await expect(zero).resolves.toMatchObject({ status: "accepted" });
    await vi.advanceTimersByTimeAsync(100);
    expect(sent.map((request) => request.seq)).toEqual([1, 3]);
    expect(sent.at(-1)?.linear.x).toBe(0);
  });

  it("does not make a zero wait for a moving command ACK", async () => {
    let resolveMoving: ((response: RuntimeTeleopCommandResponse) => void) | undefined;
    const send = vi.fn((request: RuntimeTeleopCommandRequest) =>
      request.linear.x === 0
        ? Promise.resolve(accepted(request))
        : new Promise<RuntimeTeleopCommandResponse>((resolve) => {
            resolveMoving = resolve;
          }),
    );
    const gate = new TeleopRateGate({ send });

    const moving = gate.submit(command(1));
    const zero = gate.submit(command(2, 0));

    expect(send).toHaveBeenCalledTimes(2);
    await expect(zero).resolves.toMatchObject({ status: "accepted" });
    resolveMoving?.(accepted(command(1)));
    await expect(moving).resolves.toMatchObject({ status: "accepted" });
  });
});
