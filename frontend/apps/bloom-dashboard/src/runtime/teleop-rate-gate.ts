import { MAX_JOYSTICK_PUBLISH_RATE_HZ } from "@bloom/widgets";

import type { RuntimeTeleopCommandRequest, RuntimeTeleopCommandResponse } from "./runtime-action-dispatcher";
import { isZeroTwist } from "./teleop-composition";

export type TeleopSendOutcome = {
  detail: string;
  frameId?: string;
  status: "accepted" | "coalesced" | "simulated";
};

type PendingCommand = {
  reject: (reason: unknown) => void;
  request: RuntimeTeleopCommandRequest;
  resolve: (outcome: TeleopSendOutcome) => void;
};

const DEFAULT_INTERVAL_MS = Math.ceil(1000 / MAX_JOYSTICK_PUBLISH_RATE_HZ);

type TargetLane = {
  lastMovingSendAt: number | null;
  lastMovingSubmitted: RuntimeTeleopCommandRequest | null;
  movingInFlight: boolean;
  pending: PendingCommand | null;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * One latest-value queue per teleop target.
 *
 * Widget sampling can be faster than the wire contract, especially when two
 * joysticks are held together. Moving commands are serialized and capped per
 * target, so a pad on one manager input never coalesces away another's;
 * explicit zero commands bypass both rules and cancel any stale queued move.
 */
export class TeleopRateGate {
  private readonly clock: () => number;
  private readonly intervalMs: number;
  private readonly send: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
  private readonly refresh: ((request: RuntimeTeleopCommandRequest) => RuntimeTeleopCommandRequest) | undefined;
  private readonly lanes = new Map<string, TargetLane>();

  constructor(options: {
    clock?: () => number;
    intervalMs?: number;
    /** Recomposes a queued move when it leaves, so a value withdrawn while it waited does not ride out. */
    refresh?: (request: RuntimeTeleopCommandRequest) => RuntimeTeleopCommandRequest;
    send: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
  }) {
    this.clock = options.clock ?? Date.now;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.refresh = options.refresh;
    this.send = options.send;
  }

  /** The latest moving command per target since that target's last zero; empty when the wire rests everywhere. */
  get unsettledMoves(): RuntimeTeleopCommandRequest[] {
    return [...this.lanes.values()].flatMap((lane) => (lane.lastMovingSubmitted ? [lane.lastMovingSubmitted] : []));
  }

  submit(request: RuntimeTeleopCommandRequest): Promise<TeleopSendOutcome> {
    const lane = this.lane(request.target);
    if (isZeroTwist(request)) {
      this.coalescePending(lane, "Teleop update was superseded by an explicit neutral command.");
      lane.lastMovingSubmitted = null;
      return this.sendNow(request);
    }

    lane.lastMovingSubmitted = request;
    return new Promise((resolve, reject) => {
      this.coalescePending(lane, "Teleop update was coalesced into a newer command.");
      lane.pending = { reject, request, resolve };
      this.flushOrSchedule(lane);
    });
  }

  dispose(): void {
    for (const lane of this.lanes.values()) {
      this.coalescePending(lane, "Teleop update was discarded because the runtime closed.");
    }
  }

  discardPending(): void {
    for (const lane of this.lanes.values()) {
      this.coalescePending(lane, "Teleop update was discarded because teleop was suspended.");
    }
  }

  private lane(target: string): TargetLane {
    let lane = this.lanes.get(target);
    if (!lane) {
      lane = { lastMovingSendAt: null, lastMovingSubmitted: null, movingInFlight: false, pending: null, timer: null };
      this.lanes.set(target, lane);
    }
    return lane;
  }

  private coalescePending(lane: TargetLane, detail: string): void {
    if (!lane.pending) {
      return;
    }
    lane.pending.resolve({ detail, status: "coalesced" });
    lane.pending = null;
    if (lane.timer !== null) {
      clearTimeout(lane.timer);
      lane.timer = null;
    }
  }

  private flushOrSchedule(lane: TargetLane): void {
    if (!lane.pending || lane.movingInFlight || lane.timer !== null) {
      return;
    }

    const elapsed = lane.lastMovingSendAt === null ? this.intervalMs : this.clock() - lane.lastMovingSendAt;
    const delay = Math.max(0, this.intervalMs - elapsed);
    if (delay > 0) {
      lane.timer = setTimeout(() => {
        lane.timer = null;
        this.flushOrSchedule(lane);
      }, delay);
      return;
    }

    const pending = lane.pending;
    lane.pending = null;
    lane.movingInFlight = true;
    lane.lastMovingSendAt = this.clock();
    void this.sendNow(this.refresh ? this.refresh(pending.request) : pending.request)
      .then(pending.resolve, pending.reject)
      .finally(() => {
        lane.movingInFlight = false;
        this.flushOrSchedule(lane);
      });
  }

  private async sendNow(request: RuntimeTeleopCommandRequest): Promise<TeleopSendOutcome> {
    const response = await this.send(request);
    return { detail: response.detail, frameId: response.payload.frame_id, status: response.payload.status };
  }
}
