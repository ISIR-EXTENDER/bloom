import type { RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";
import { isZeroTwist, type TeleopTwistComposer } from "./teleop-composition";

type StreamTarget = Pick<RuntimeTeleopCommandRequest, "frame_id" | "mode" | "target">;

const DEFAULT_STREAM_TARGET: StreamTarget = { mode: 0, target: "/joystick_cartesian_command" };

/**
 * Re-sends the composed twist between widget events: cartesian_manager drops
 * an input older than timeout_sec (0.2s on Explorer), so a slider that only
 * publishes on change cannot hold a velocity. Defers to widgets that already
 * stream, sends a short zero tail on release, backs off on a refused send.
 */
export class TeleopStreamPump {
  private readonly composer: TeleopTwistComposer;
  private readonly send: (request: RuntimeTeleopCommandRequest) => Promise<unknown>;
  private readonly nextSequence: () => number;
  private readonly intervalMs: number;
  private readonly zeroTailFrames: number;
  private readonly maxRetries: number;
  private readonly unsettledMove: () => StreamTarget | null;
  private readonly onGiveUp: () => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private lastRequest: StreamTarget | null = null;
  private sessionFrameId: string | undefined;
  private lastSentAt = 0;
  private zeroFramesLeft = 0;

  constructor(options: {
    composer: TeleopTwistComposer;
    send: (request: RuntimeTeleopCommandRequest) => Promise<unknown>;
    nextSequence: () => number;
    intervalMs?: number;
    zeroTailFrames?: number;
    maxRetries?: number;
    /** A move submitted but not yet acknowledged: suspend must still end it with a zero. */
    unsettledMove?: () => StreamTarget | null;
    onGiveUp?: () => void;
  }) {
    this.composer = options.composer;
    this.send = options.send;
    this.nextSequence = options.nextSequence;
    this.intervalMs = options.intervalMs ?? 50;
    this.zeroTailFrames = options.zeroTailFrames ?? 6;
    this.maxRetries = options.maxRetries ?? 3;
    this.unsettledMove = options.unsettledMove ?? (() => null);
    this.onGiveUp = options.onGiveUp ?? (() => undefined);
  }

  noteDispatched(request: RuntimeTeleopCommandRequest, outcome: "failed" | "sent", sessionFrameId?: string): void {
    if (outcome === "failed") {
      this.stop();
      return;
    }

    this.lastRequest = { frame_id: request.frame_id, mode: request.mode, target: request.target };
    if (sessionFrameId !== undefined) {
      this.sessionFrameId = sessionFrameId;
    }
    this.lastSentAt = Date.now();
    this.zeroFramesLeft = this.zeroTailFrames;
    this.failures = 0;
    this.clearRetry();
    this.start();
  }

  /**
   * A non-widget source contributed. It has no dispatched request of its own,
   * so the pump adopts a default target the first time and otherwise keeps
   * streaming whatever the widgets established.
   */
  noteExternalContribution(fallback: StreamTarget): void {
    if (!this.lastRequest) {
      this.lastRequest = fallback;
    }
    // An empty frame counts: it is a reset to the backend default, not "no opinion".
    if (fallback.frame_id !== undefined) {
      this.sessionFrameId = fallback.frame_id;
    }
    this.zeroFramesLeft = this.zeroTailFrames;
    this.start();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearRetry();
  }

  /** End a runtime surface with one explicit zero, then forget its target. */
  suspend(): Promise<void> {
    this.stop();
    const target = this.lastRequest ?? this.unsettledMove();
    const sessionFrameId = this.sessionFrameId;
    this.lastRequest = null;
    this.sessionFrameId = undefined;
    this.lastSentAt = 0;
    this.zeroFramesLeft = 0;
    this.failures = 0;

    if (target === null) {
      return Promise.resolve();
    }

    const frameId = sessionFrameId ?? target.frame_id;
    return this.send({
      type: "teleop_cmd",
      angular: { x: 0, y: 0, z: 0 },
      ...(frameId ? { frame_id: frameId } : {}),
      linear: { x: 0, y: 0, z: 0 },
      mode: target.mode ?? DEFAULT_STREAM_TARGET.mode,
      seq: this.nextSequence(),
      target: target.target ?? DEFAULT_STREAM_TARGET.target,
    }).then(() => undefined);
  }

  private start(): void {
    if (this.timer === null && this.retryTimer === null) {
      this.timer = setInterval(() => this.tick(), this.intervalMs);
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private tick(): void {
    // A widget stream is already keeping the command fresh.
    if (Date.now() - this.lastSentAt < this.intervalMs) {
      return;
    }
    const lastRequest = this.lastRequest;
    if (lastRequest === null) {
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

    const frameId = this.composer.resolveFrame(this.sessionFrameId ?? lastRequest.frame_id ?? "").frameId;
    this.lastSentAt = Date.now();
    this.send({
      type: "teleop_cmd",
      angular: twist.angular,
      ...(frameId ? { frame_id: frameId } : {}),
      linear: twist.linear,
      mode: lastRequest.mode,
      seq: this.nextSequence(),
      target: lastRequest.target,
    }).then(
      () => {
        this.failures = 0;
      },
      () => this.backOff(),
    );
  }

  // A refused tick (a busy socket, a rate limit) retries a few times; giving up hands the display back to rest.
  private backOff(): void {
    if (this.retryTimer !== null || this.lastRequest === null) {
      return;
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.failures += 1;
    if (this.failures > this.maxRetries) {
      this.failures = 0;
      this.onGiveUp();
      return;
    }
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        this.lastSentAt = 0;
        this.start();
      },
      this.intervalMs * 2 ** this.failures,
    );
  }
}
