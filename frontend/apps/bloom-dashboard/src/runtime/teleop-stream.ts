import type { RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";
import type { TeleopTwist, TeleopTwistComposer } from "./teleop-composition";

/**
 * Keeps the composed teleop twist alive between widget events.
 *
 * `cartesian_manager` drops an input source whose latest command is older than
 * its `timeout_sec` -- 0.2s in the Explorer bringup -- and then streams zeros.
 * That fail-to-zero is the chain's one safety property, and it means any
 * source that wants sustained motion must keep publishing. The joystick
 * renderer does: it re-emits at its publish rate while held. Sliders do not:
 * they emit on value change only, so holding the Z slider at full deflection
 * moved the arm for 0.2s and stopped. The composition layer's contract note
 * always said the runtime "must keep publishing the composed twist"; this is
 * the piece that actually does it.
 *
 * The pump defers to widget-driven sends -- a tick inside one interval of the
 * last real send is skipped, so a held joystick does not publish at double
 * rate -- and it re-sends the *composed* twist, so the heartbeat carries every
 * engaged widget's contribution, not just the last one that moved.
 *
 * When the twist returns to zero the pump sends a short explicit-zero tail and
 * goes quiet: the manager's own timeout owns "stopped" from there, and an
 * idle screen must not stream forever into the rate limiter or, worse, into
 * an engaged STOP latch. Any rejected send stops the pump for the same
 * reason -- while the runtime stop refuses teleop, retrying at 20Hz would be
 * fighting the latch. The next widget event starts it again.
 */
export class TeleopStreamPump {
  private readonly composer: TeleopTwistComposer;
  private readonly send: (request: RuntimeTeleopCommandRequest) => Promise<unknown>;
  private readonly nextSequence: () => number;
  private readonly intervalMs: number;
  private readonly zeroTailFrames: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRequest: Pick<RuntimeTeleopCommandRequest, "mode" | "target"> | null = null;
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

  /** A widget-driven teleop send happened; keep its twist alive from here. */
  noteDispatched(request: RuntimeTeleopCommandRequest, outcome: "failed" | "sent"): void {
    if (outcome === "failed") {
      this.stop();
      return;
    }

    this.lastRequest = { mode: request.mode, target: request.target };
    this.lastSentAt = Date.now();
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

  private tick(): void {
    // A widget stream (the held joystick at 30Hz) is already keeping the
    // command fresh; publishing on top of it would double the rate.
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
      linear: twist.linear,
      mode: this.lastRequest.mode,
      seq: this.nextSequence(),
      target: this.lastRequest.target,
    }).catch(() => {
      // Rejected -- the stop latch, a dead socket, a policy change. The
      // manager fails to zero on its own; hammering the same refusal at
      // 20Hz helps nobody. The next widget event starts the pump again.
      this.stop();
    });
  }
}

function isZeroTwist(twist: TeleopTwist): boolean {
  return (
    twist.linear.x === 0 &&
    twist.linear.y === 0 &&
    twist.linear.z === 0 &&
    twist.angular.x === 0 &&
    twist.angular.y === 0 &&
    twist.angular.z === 0
  );
}
