import type { RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";
import { isZeroTwist, type TeleopTwistComposer } from "./teleop-composition";

/**
 * Re-sends the composed twist between widget events: cartesian_manager drops
 * an input older than timeout_sec (0.2s on Explorer), so a slider that only
 * publishes on change cannot hold a velocity. Defers to widgets that already
 * stream, sends a short zero tail on release, stops on any refused send.
 */
export class TeleopStreamPump {
  private readonly composer: TeleopTwistComposer;
  private readonly send: (request: RuntimeTeleopCommandRequest) => Promise<unknown>;
  private readonly nextSequence: () => number;
  private readonly intervalMs: number;
  private readonly zeroTailFrames: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRequest: Pick<RuntimeTeleopCommandRequest, "frame_id" | "mode" | "target"> | null = null;
  private lastSentAt = 0;
  private zeroFramesLeft = 0;

  constructor(options: {
    composer: TeleopTwistComposer;
    send: (request: RuntimeTeleopCommandRequest) => Promise<unknown>;
    nextSequence: () => number;
    intervalMs?: number;
    zeroTailFrames?: number;
  }) {
    this.composer = options.composer;
    this.send = options.send;
    this.nextSequence = options.nextSequence;
    this.intervalMs = options.intervalMs ?? 50;
    this.zeroTailFrames = options.zeroTailFrames ?? 6;
  }

  noteDispatched(request: RuntimeTeleopCommandRequest, outcome: "failed" | "sent"): void {
    if (outcome === "failed") {
      this.stop();
      return;
    }

    this.lastRequest = { frame_id: request.frame_id, mode: request.mode, target: request.target };
    this.lastSentAt = Date.now();
    this.zeroFramesLeft = this.zeroTailFrames;
    if (this.timer === null) {
      this.timer = setInterval(() => this.tick(), this.intervalMs);
    }
  }

  /**
   * A non-widget source contributed. It has no dispatched request of its own,
   * so the pump adopts a default target the first time and otherwise keeps
   * streaming whatever the widgets established.
   */
  noteExternalContribution(fallback: Pick<RuntimeTeleopCommandRequest, "frame_id" | "mode" | "target">): void {
    if (!this.lastRequest) {
      this.lastRequest = fallback;
    } else if (fallback.frame_id !== undefined) {
      this.lastRequest = { ...this.lastRequest, frame_id: fallback.frame_id };
    }
    this.zeroFramesLeft = this.zeroTailFrames;
    if (this.timer === null) {
      this.timer = setInterval(() => this.tick(), this.intervalMs);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** End a runtime surface with one explicit zero, then forget its target. */
  suspend(): Promise<void> {
    this.stop();
    const lastRequest = this.lastRequest;
    this.lastRequest = null;
    this.lastSentAt = 0;
    this.zeroFramesLeft = 0;

    if (lastRequest === null) {
      return Promise.resolve();
    }

    return this.send({
      type: "teleop_cmd",
      angular: { x: 0, y: 0, z: 0 },
      ...(lastRequest.frame_id ? { frame_id: lastRequest.frame_id } : {}),
      linear: { x: 0, y: 0, z: 0 },
      mode: lastRequest.mode,
      seq: this.nextSequence(),
      target: lastRequest.target,
    }).then(() => undefined);
  }

  private tick(): void {
    // A widget stream is already keeping the command fresh.
    if (Date.now() - this.lastSentAt < this.intervalMs) {
      return;
    }
    if (this.lastRequest === null) {
      this.stop();
      return;
    }

    const twist = this.composer.compose();
    if (isZeroTwist(twist)) {
      if (this.zeroFramesLeft <= 0) {
        this.stop();
        return;
      }
      this.zeroFramesLeft -= 1;
    } else {
      this.zeroFramesLeft = this.zeroTailFrames;
    }

    this.lastSentAt = Date.now();
    this.send({
      type: "teleop_cmd",
      angular: twist.angular,
      ...(this.lastRequest.frame_id ? { frame_id: this.lastRequest.frame_id } : {}),
      linear: twist.linear,
      mode: this.lastRequest.mode,
      seq: this.nextSequence(),
      target: this.lastRequest.target,
    }).catch(() => {
      // Refused (stop latch, dead socket): the next widget event restarts us.
      this.stop();
    });
  }
}
