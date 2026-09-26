import type { RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";
import { composeTeleopMode, isZeroTwist, type TeleopTwistComposer } from "./teleop-composition";

type StreamTarget = Pick<RuntimeTeleopCommandRequest, "frame_id" | "mode" | "target">;

type Stream = StreamTarget & { lastSentAt: number; zeroFramesLeft: number };

/**
 * Re-sends each target's composed twist between widget events: cartesian_manager drops
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
  private readonly unsettledMoves: () => readonly StreamTarget[];
  private readonly onGiveUp: () => void;
  private readonly allowedFrameIds: () => readonly string[] | undefined;

  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private readonly streams = new Map<string, Stream>();
  // The target widgets last established, which a non-widget source follows.
  private widgetTarget: StreamTarget | null = null;
  // Every target a move went to since its last zero: a suspend ends each, not only the latest.
  private readonly owedTargets = new Map<string, StreamTarget>();
  private sessionFrameId: string | undefined;

  constructor(options: {
    composer: TeleopTwistComposer;
    send: (request: RuntimeTeleopCommandRequest) => Promise<unknown>;
    nextSequence: () => number;
    intervalMs?: number;
    zeroTailFrames?: number;
    maxRetries?: number;
    /** Moves submitted but not yet acknowledged: suspend must still end each with a zero. */
    unsettledMoves?: () => readonly StreamTarget[];
    onGiveUp?: () => void;
    /** The robot's command frames; a frame outside them never leaves. */
    allowedFrameIds?: () => readonly string[] | undefined;
  }) {
    this.composer = options.composer;
    this.send = options.send;
    this.nextSequence = options.nextSequence;
    this.intervalMs = options.intervalMs ?? 50;
    this.zeroTailFrames = options.zeroTailFrames ?? 6;
    this.maxRetries = options.maxRetries ?? 3;
    this.unsettledMoves = options.unsettledMoves ?? (() => []);
    this.onGiveUp = options.onGiveUp ?? (() => undefined);
    this.allowedFrameIds = options.allowedFrameIds ?? (() => undefined);
  }

  /** The target a non-widget source should drive: the one widgets established, else `fallback`. */
  externalTarget(fallback: string): string {
    return this.widgetTarget?.target ?? fallback;
  }

  noteDispatched(request: RuntimeTeleopCommandRequest, outcome: "failed" | "sent", sessionFrameId?: string): void {
    if (outcome === "failed") {
      this.stop();
      return;
    }

    const target: StreamTarget = { frame_id: request.frame_id, mode: request.mode, target: request.target };
    this.widgetTarget = target;
    this.streams.set(request.target, { ...target, lastSentAt: Date.now(), zeroFramesLeft: this.zeroTailFrames });
    if (isZeroTwist(request)) {
      this.owedTargets.delete(request.target);
    } else {
      this.owedTargets.set(request.target, target);
    }
    if (sessionFrameId !== undefined) {
      this.sessionFrameId = sessionFrameId;
    }
    this.failures = 0;
    this.clearRetry();
    this.start();
  }

  /**
   * A non-widget source contributed to `fallback.target`. It has no dispatched
   * request of its own, so the pump streams that target with the fallback's
   * mode unless a widget already established it.
   */
  noteExternalContribution(fallback: StreamTarget): void {
    let stream = this.streams.get(fallback.target);
    if (stream) {
      stream.zeroFramesLeft = this.zeroTailFrames;
    } else {
      const established = this.widgetTarget?.target === fallback.target ? this.widgetTarget : fallback;
      stream = { ...established, lastSentAt: 0, zeroFramesLeft: this.zeroTailFrames };
      this.streams.set(fallback.target, stream);
    }
    if (!this.owedTargets.has(fallback.target)) {
      this.owedTargets.set(fallback.target, stream);
    }
    // An empty frame counts: it is a reset to the backend default, not "no opinion".
    if (fallback.frame_id !== undefined) {
      this.sessionFrameId = fallback.frame_id;
    }
    this.start();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clearRetry();
  }

  /** End a runtime surface with one explicit zero per target it moved, then forget them. */
  suspend(): Promise<void> {
    this.stop();
    const owed = new Map<string, StreamTarget>(this.owedTargets);
    for (const target of [this.widgetTarget, ...this.unsettledMoves()]) {
      if (target !== null && !owed.has(target.target)) {
        owed.set(target.target, target);
      }
    }
    const sessionFrameId = this.sessionFrameId;
    this.owedTargets.clear();
    this.streams.clear();
    this.widgetTarget = null;
    this.sessionFrameId = undefined;
    this.failures = 0;

    return Promise.all(
      [...owed.values()].map((target) => {
        const frameId = this.allowedFrame(sessionFrameId ?? target.frame_id ?? "");
        return this.send({
          type: "teleop_cmd",
          angular: { x: 0, y: 0, z: 0 },
          ...(frameId ? { frame_id: frameId } : {}),
          linear: { x: 0, y: 0, z: 0 },
          mode: target.mode,
          seq: this.nextSequence(),
          target: target.target,
        });
      }),
    ).then(() => undefined);
  }

  private allowedFrame(frameId: string): string {
    const allowed = this.allowedFrameIds();
    return !frameId || !allowed || allowed.includes(frameId) ? frameId : "";
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
    for (const stream of [...this.streams.values()]) {
      this.tickStream(stream);
    }
    if (this.streams.size === 0) {
      this.stop();
    }
  }

  private tickStream(stream: Stream): void {
    // A widget stream is already keeping this target fresh.
    if (Date.now() - stream.lastSentAt < this.intervalMs) {
      return;
    }

    const twist = this.composer.compose(stream.target);
    if (isZeroTwist(twist)) {
      if (stream.zeroFramesLeft <= 0) {
        this.streams.delete(stream.target);
        return;
      }
      stream.zeroFramesLeft -= 1;
    } else {
      stream.zeroFramesLeft = this.zeroTailFrames;
    }

    const frameId = this.composer.resolveFrame(
      this.sessionFrameId ?? stream.frame_id ?? "",
      this.allowedFrameIds(),
      stream.target,
    ).frameId;
    stream.lastSentAt = Date.now();
    this.send({
      type: "teleop_cmd",
      angular: twist.angular,
      ...(frameId ? { frame_id: frameId } : {}),
      linear: twist.linear,
      mode: composeTeleopMode(twist, stream.mode, stream.target),
      seq: this.nextSequence(),
      target: stream.target,
    }).then(
      () => {
        this.failures = 0;
      },
      () => this.backOff(),
    );
  }

  // A refused tick (a busy socket, a rate limit) retries a few times; giving up hands the display back to rest.
  private backOff(): void {
    if (this.retryTimer !== null || this.streams.size === 0) {
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
        for (const stream of this.streams.values()) {
          stream.lastSentAt = 0;
        }
        this.start();
      },
      this.intervalMs * 2 ** this.failures,
    );
  }
}
