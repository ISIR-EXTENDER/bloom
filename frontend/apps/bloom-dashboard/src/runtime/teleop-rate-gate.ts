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

/**
 * One latest-value queue for the composed teleop stream.
 *
 * Widget sampling can be faster than the wire contract, especially when two
 * joysticks are held together. Moving commands are serialized and capped;
 * explicit zero commands bypass both rules and cancel any stale queued move.
 */
export class TeleopRateGate {
  private readonly clock: () => number;
  private readonly intervalMs: number;
  private readonly send: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
  private readonly refresh: ((request: RuntimeTeleopCommandRequest) => RuntimeTeleopCommandRequest) | undefined;

  private lastMovingSubmitted: RuntimeTeleopCommandRequest | null = null;
  private lastMovingSendAt: number | null = null;
  private movingInFlight = false;
  private pending: PendingCommand | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

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

  /** The latest moving command submitted since the last zero, or null when the wire already ends at rest. */
  get unsettledMove(): RuntimeTeleopCommandRequest | null {
    return this.lastMovingSubmitted;
  }

  submit(request: RuntimeTeleopCommandRequest): Promise<TeleopSendOutcome> {
    if (isZeroTwist(request)) {
      this.coalescePending("Teleop update was superseded by an explicit neutral command.");
      this.lastMovingSubmitted = null;
      return this.sendNow(request);
    }

    this.lastMovingSubmitted = request;
    return new Promise((resolve, reject) => {
      this.coalescePending("Teleop update was coalesced into a newer command.");
      this.pending = { reject, request, resolve };
      this.flushOrSchedule();
    });
  }

  dispose(): void {
    this.coalescePending("Teleop update was discarded because the runtime closed.");
  }

  discardPending(): void {
    this.coalescePending("Teleop update was discarded because teleop was suspended.");
  }

  private coalescePending(detail: string): void {
    if (!this.pending) {
      return;
    }
    this.pending.resolve({ detail, status: "coalesced" });
    this.pending = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private flushOrSchedule(): void {
    if (!this.pending || this.movingInFlight || this.timer !== null) {
      return;
    }

    const elapsed = this.lastMovingSendAt === null ? this.intervalMs : this.clock() - this.lastMovingSendAt;
    const delay = Math.max(0, this.intervalMs - elapsed);
    if (delay > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flushOrSchedule();
      }, delay);
      return;
    }

    const pending = this.pending;
    this.pending = null;
    this.movingInFlight = true;
    this.lastMovingSendAt = this.clock();
    void this.sendNow(this.refresh ? this.refresh(pending.request) : pending.request)
      .then(pending.resolve, pending.reject)
      .finally(() => {
        this.movingInFlight = false;
        this.flushOrSchedule();
      });
  }

  private async sendNow(request: RuntimeTeleopCommandRequest): Promise<TeleopSendOutcome> {
    const response = await this.send(request);
    return { detail: response.detail, frameId: response.payload.frame_id, status: response.payload.status };
  }
}
