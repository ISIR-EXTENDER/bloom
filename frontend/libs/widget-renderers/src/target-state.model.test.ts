import type { WidgetActionIntent } from "@bloom/widgets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  actorKey,
  attachWidget,
  beginAct,
  cancelAllPendingEngaging,
  cancelPending,
  detachWidget,
  getJobSnapshot,
  getTargetSnapshot,
  MODE_REQUEST_TOPIC,
  payloadKey,
  readMomentary,
  readToggle,
  resetDesiredStates,
  sendOneShot,
  setDesired,
  settleForAssertedStop,
  settleForNewSession,
  VISUAL_SERVOING_SWITCH_TOPIC,
} from "./desired-state";
import type { WidgetActionOutcome, WidgetActionStatus } from "./types";

// ADR 0141: random operator acts, replies and resets against a reference robot. After every step: (a) no control
// shows a clean state the robot does not hold; (b) nothing re-applies an engaging act after a STOP or suspend;
// (c) no older act is sent after a newer one on its target; (d) retries stay bounded; (e) a hold ends without its
// release only once the manager left it, or a newer act's outcome is unknown.

const SEQUENCES = 5000;
const STEPS = 80;
const GRIPPER = "/gripper";
const MODE = MODE_REQUEST_TOPIC;
const SERVO = VISUAL_SERVOING_SWITCH_TOPIC;
const ON = "{data: true}";
const OFF = "{data: false}";
const MODE_PAYLOAD = {
  snake: { data: "geometric/snake" },
  both: { data: "geometric/both" },
  jaco: { data: "geometric/jaco" },
};
const TOGGLES = [
  { id: "A", target: GRIPPER },
  { id: "B", target: GRIPPER },
  { id: "C", target: GRIPPER },
  { id: "V", target: SERVO },
] as const;
const WIDGETS = ["A", "B", "C", "V", "S", "J"] as const;
const TARGET_OF: Record<string, string> = { A: GRIPPER, B: GRIPPER, C: GRIPPER, V: SERVO, S: MODE, J: MODE };
const TOGGLE_KEYS = { on: payloadKey(ON), off: payloadKey(OFF) };
const SNAKE_KEY = payloadKey(MODE_PAYLOAD.snake);

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Op = { index: number; target: string; widget: string; neutral: boolean; cancelled: boolean; sends: number };

type Request = {
  seq: number;
  widget: string;
  target: string;
  value: string;
  release: boolean;
  session: number;
  sentAt: number;
  beforeStop: boolean;
  answer: (outcome: WidgetActionOutcome | Error) => void;
};

class Harness {
  robot: Record<string, string> = { [GRIPPER]: "off", [MODE]: "both", [SERVO]: "off" };
  applied: Record<string, number> = {};
  session = 1;
  stopAsserted = false;
  queue: Request[] = [];
  httpSeq = 0;
  opCount = 0;
  latestOp: Record<string, number> = {};
  ops: Op[] = [];
  mounted = new Set<string>(WIDGETS);
  detachedAt: Record<string, number> = {};
  retries: Record<string, number[]> = {};
  snakeHeld = false;
  snakePressSeq = 0;
  unknownModeSeq = 0;
  log: string[] = [];
  /** A violation seen inside a send, which the store's own try/catch would otherwise swallow. */
  violation: string | null = null;

  constructor(readonly random: () => number) {}

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)] as T;
  }

  newOp(target: string, widget: string, neutral: boolean): Op {
    this.opCount += 1;
    const op = { index: this.opCount, target, widget, neutral, cancelled: false, sends: 0 };
    this.latestOp[target] = op.index;
    this.ops.push(op);
    return op;
  }

  bumpTarget(target: string): void {
    this.opCount += 1;
    this.latestOp[target] = this.opCount;
  }

  cancelEngaging(): void {
    for (const op of this.ops) {
      if (!op.neutral) {
        op.cancelled = true;
      }
    }
  }

  sendFor(op: Op, value: string) {
    return (intent: WidgetActionIntent): Promise<WidgetActionOutcome> => {
      const now = Date.now();
      this.fail(op.index === this.latestOp[op.target], `(c) ${op.widget} sent op ${op.index} after a newer act`);
      this.fail(!op.cancelled, `(b) ${op.widget} re-sent an engaging act after STOP or suspend`);
      const detached = this.detachedAt[op.widget];
      this.fail(
        this.mounted.has(op.widget) || detached === undefined || now - detached <= 62_000,
        `(d) ${op.widget} still sending ${now - (detached ?? now)} ms after it unmounted`,
      );
      if (op.sends > 0) {
        const window = (this.retries[op.target] ?? []).filter((at) => now - at < 60_000);
        window.push(now);
        this.retries[op.target] = window;
        this.fail(window.length <= 40, `(d) ${window.length} retries on ${op.target} within 60 s`);
      }
      op.sends += 1;
      return this.request(op, value, intent.type === "topic-publish" && intent.release === true);
    };
  }

  request(op: Op, value: string, release: boolean): Promise<WidgetActionOutcome> {
    this.httpSeq += 1;
    const seq = this.httpSeq;
    if (op.widget === "S" && value === "snake") {
      this.snakePressSeq = seq;
    }
    return new Promise<WidgetActionOutcome>((resolve, reject) => {
      this.queue.push({
        seq,
        widget: op.widget,
        target: op.target,
        value,
        release,
        session: this.session,
        sentAt: Date.now(),
        beforeStop: false,
        answer: (outcome) => {
          if (outcome instanceof Error && op.target === MODE && op.widget !== "S") {
            this.unknownModeSeq = Math.max(this.unknownModeSeq, seq);
          }
          return outcome instanceof Error ? reject(outcome) : resolve(outcome);
        },
      });
    });
  }

  deliver(request: Request): void {
    this.queue = this.queue.filter((other) => other !== request);
    const roll = this.random();
    if (roll < 0.08) {
      request.answer(new Error("lost before the server"));
      return;
    }
    if (roll < 0.13) {
      request.answer({ accepted: false, status: "transient" });
      return;
    }
    if (roll < 0.17 || request.session !== this.session || (this.stopAsserted && !request.release)) {
      request.answer({ accepted: false, status: "refused", detail: "refused" });
      return;
    }
    if (request.seq <= (this.applied[request.target] ?? 0)) {
      request.answer({ accepted: false, status: "superseded" });
      return;
    }
    this.applied[request.target] = request.seq;
    this.robot[request.target] = request.value;
    request.answer(this.random() < 0.15 ? new Error("reply lost") : { accepted: true });
  }

  timeOut(): void {
    for (const request of [...this.queue]) {
      if (Date.now() - request.sentAt >= 4000) {
        this.queue = this.queue.filter((other) => other !== request);
        request.answer(new Error("timed out after 4 s"));
      }
    }
  }

  toggleIsOn(target: string): boolean {
    const view = readToggle(getTargetSnapshot(target), TOGGLE_KEYS);
    return view.state === "on";
  }

  clickToggle(id: string, target: string): void {
    const next = this.toggleIsOn(target) ? "off" : "on";
    this.requestToggle(id, target, next);
  }

  requestToggle(id: string, target: string, next: "on" | "off"): void {
    const release = target === SERVO && next === "off";
    const op = this.newOp(target, id, release);
    const intent: WidgetActionIntent = {
      type: "topic-publish",
      topic: target,
      messageType: "std_msgs/msg/Bool",
      payload: next === "on" ? ON : OFF,
      widgetId: id,
      widgetKind: "toggle",
      ...(release ? { release: true } : {}),
    };
    setDesired({ widgetId: id, target, value: next, engage: next === "on", intent, send: this.sendFor(op, next) });
  }

  snake(value: "pressed" | "released"): void {
    const op = this.newOp(MODE, "S", value === "released");
    this.snakeHeld = value === "pressed";
    setDesired({
      widgetId: "S",
      target: MODE,
      value,
      engage: value === "pressed",
      momentary: true,
      intent: {
        type: "topic-publish",
        topic: MODE,
        messageType: "std_msgs/msg/String",
        payload: value === "pressed" ? MODE_PAYLOAD.snake : MODE_PAYLOAD.both,
        widgetId: "S",
        widgetKind: "command-button",
        ...(value === "released" ? { release: true } : {}),
      },
      send: this.sendFor(op, value === "pressed" ? "snake" : "both"),
    });
  }

  jaco(): void {
    const op = this.newOp(MODE, "J", false);
    setDesired({
      widgetId: "J",
      target: MODE,
      value: "requested",
      engage: true,
      intent: {
        type: "topic-publish",
        topic: MODE,
        messageType: "std_msgs/msg/String",
        payload: MODE_PAYLOAD.jaco,
        widgetId: "J",
        widgetKind: "command-button",
      },
      send: this.sendFor(op, "jaco"),
    });
  }

  oneShot(id: string, target: string, value: string): void {
    const op = this.newOp(target, id, false);
    const intent: WidgetActionIntent = {
      type: "topic-publish",
      topic: target,
      messageType: "std_msgs/msg/String",
      payload: { data: value },
      widgetId: id,
      widgetKind: "command-button",
    };
    sendOneShot({ widgetId: id, target, intent, send: this.sendFor(op, value) });
  }

  dispatcherAct(value: "on" | "off"): void {
    const op = this.newOp(GRIPPER, "slider", false);
    const intent: WidgetActionIntent = {
      type: "value-change",
      value: value === "on" ? 1 : 0,
      widgetId: "slider",
      widgetKind: "slider",
    };
    const settle = beginAct(GRIPPER, intent);
    this.sendFor(
      op,
      value,
    )(intent).then(
      (outcome) => settle(outcome.status ?? (outcome.accepted ? "accepted" : "refused")),
      () => settle("unknown" satisfies WidgetActionStatus),
    );
  }

  /** What a suspend asks of the mounted controls: the servo switch off, a Snake hold released. */
  settleControls(): void {
    const servoJob = getJobSnapshot("V", SERVO);
    if (this.mounted.has("V") && (this.toggleIsOn(SERVO) || (servoJob?.active && servoJob.value === "on"))) {
      this.requestToggle("V", SERVO, "off");
    }
    for (const { id, target } of TOGGLES) {
      cancelPending(id, target);
    }
    if (this.snakeHeld) {
      this.snake("released");
    }
  }

  followSnakeHold(): void {
    const job = getJobSnapshot("S", MODE);
    const state = getTargetSnapshot(MODE);
    if (!this.snakeHeld || !job) {
      return;
    }
    if (state.appliedSeq > job.lastActSeq && state.appliedBy !== actorKey("", "S")) {
      this.fail(
        this.robot[MODE] !== "snake" || this.unknownModeSeq > this.snakePressSeq,
        "(e) the Snake hold ended without its release while the manager is still in snake",
      );
      this.snakeHeld = false;
    } else if (job.refused && job.value === "pressed") {
      this.snakeHeld = false;
    }
  }

  checkScreen(): void {
    for (const { id, target } of TOGGLES) {
      const view = readToggle(getTargetSnapshot(target), TOGGLE_KEYS);
      if (view.clean) {
        const shown = view.state ?? "off";
        this.fail(shown === this.robot[target], `(a) ${id} shows ${shown} clean, robot has ${this.robot[target]}`);
      }
    }
    const snake = readMomentary(getTargetSnapshot(MODE), actorKey("", "S"), SNAKE_KEY, this.snakeHeld);
    if (snake.clean) {
      const pressed = snake.pressed ?? this.snakeHeld;
      this.fail(
        pressed === (this.robot[MODE] === "snake"),
        `(a) Snake shows ${pressed ? "pressed" : "released"} clean, robot mode is ${this.robot[MODE]}`,
      );
    }
  }

  fail(ok: boolean, message: string): void {
    if (!ok) {
      this.violation ??= `${message}\n${this.log.slice(-25).join("\n")}`;
      throw new Error(this.violation);
    }
  }

  raise(): void {
    if (this.violation) {
      throw new Error(this.violation);
    }
  }
}

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function step(h: Harness): Promise<void> {
  const roll = h.random();
  const mountedToggles = TOGGLES.filter(({ id }) => h.mounted.has(id));
  if (roll < 0.3 && h.queue.length > 0) {
    const request = h.pick(h.queue);
    h.log.push(`deliver #${request.seq} ${request.target} ${request.value}`);
    h.deliver(request);
  } else if (roll < 0.45 && mountedToggles.length > 0) {
    const { id, target } = h.pick(mountedToggles);
    h.log.push(`click ${id}`);
    h.clickToggle(id, target);
  } else if (roll < 0.52 && h.mounted.has("S")) {
    h.log.push(h.snakeHeld ? "snake release" : "snake press");
    h.snake(h.snakeHeld ? "released" : "pressed");
  } else if (roll < 0.56 && h.mounted.has("J")) {
    h.log.push("jaco");
    h.jaco();
  } else if (roll < 0.59) {
    const value = h.pick(["on", "off"] as const);
    h.log.push(`one-shot gripper ${value}`);
    h.oneShot("O", GRIPPER, value);
  } else if (roll < 0.61) {
    h.log.push("one-shot home");
    h.oneShot("H", MODE, "home");
  } else if (roll < 0.64) {
    const value = h.pick(["on", "off"] as const);
    h.log.push(`dispatcher act ${value}`);
    h.dispatcherAct(value);
  } else if (roll < 0.78) {
    const ms = h.random() < 0.9 ? Math.floor(h.random() * 3000) : 10_000 + Math.floor(h.random() * 60_000);
    h.log.push(`advance ${ms} ms`);
    await flush(ms);
    h.timeOut();
  } else if (roll < 0.81 && !h.stopAsserted) {
    h.log.push("STOP asserted");
    h.stopAsserted = true;
    h.robot[MODE] = "both";
    h.robot[SERVO] = "off";
    for (const request of h.queue) {
      request.beforeStop = true;
    }
    cancelAllPendingEngaging();
    h.cancelEngaging();
    settleForAssertedStop();
    h.bumpTarget(MODE);
    h.bumpTarget(SERVO);
    h.followSnakeHold();
    h.settleControls();
  } else if (roll < 0.84 && h.stopAsserted) {
    // A request sent before the STOP reaches the server before the STOP is released.
    for (const request of h.queue.filter((candidate) => candidate.beforeStop)) {
      h.deliver(request);
    }
    h.log.push("STOP released");
    h.stopAsserted = false;
  } else if (roll < 0.87) {
    h.log.push("suspend");
    cancelAllPendingEngaging();
    h.cancelEngaging();
    h.settleControls();
  } else if (roll < 0.94) {
    const widget = h.pick(WIDGETS);
    if (h.mounted.has(widget)) {
      h.log.push(`unmount ${widget}`);
      h.mounted.delete(widget);
      h.detachedAt[widget] = Date.now();
      if (widget === "V" && h.toggleIsOn(SERVO)) {
        h.requestToggle("V", SERVO, "off");
      }
      if (widget === "S" && h.snakeHeld) {
        h.snake("released");
      }
      detachWidget(widget, TARGET_OF[widget] as string);
    } else {
      h.log.push(`remount ${widget}`);
      h.mounted.add(widget);
      delete h.detachedAt[widget];
      attachWidget(widget, TARGET_OF[widget] as string);
    }
  } else if (roll < 0.96) {
    h.log.push("new session");
    h.session += 1;
    h.applied = {};
    h.robot[MODE] = "both";
    h.robot[SERVO] = "off";
    h.cancelEngaging();
    settleForNewSession();
    h.bumpTarget(MODE);
    h.bumpTarget(SERVO);
  } else if (h.queue.length > 0) {
    const request = h.pick(h.queue);
    h.log.push(`deliver late #${request.seq}`);
    h.deliver(request);
  }
  await flush();
  h.followSnakeHold();
  h.raise();
  h.checkScreen();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  resetDesiredStates();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the target store against a reference robot", () => {
  it(`keeps its invariants over ${SEQUENCES} seeded random sequences`, async () => {
    let steps = 0;
    for (let seed = 1; seed <= SEQUENCES; seed += 1) {
      resetDesiredStates();
      vi.clearAllTimers();
      const h = new Harness(prng(seed));
      for (const widget of WIDGETS) {
        attachWidget(widget, TARGET_OF[widget] as string);
      }
      try {
        for (let index = 0; index < STEPS; index += 1) {
          await step(h);
          steps += 1;
        }
      } catch (error) {
        throw new Error(`seed ${seed}: ${(error as Error).message}`);
      }
    }
    expect(steps).toBe(SEQUENCES * STEPS);
  }, 300_000);
});
