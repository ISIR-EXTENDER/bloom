import { readModeRequestData, type WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { WidgetActionIntentHandler, WidgetActionOutcome, WidgetActionStatus } from "./types";

// ADR 0141: one state per robot target, fed by every act on it in X-Bloom-Publish-Seq order.

export const VISUAL_SERVOING_SWITCH_TOPIC = "/ui/visual_servoing/on";
export const MODE_REQUEST_TOPIC = "/mode_request";

const RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const;
const STEADY_RETRY_MS = 2000;
const MARK_AFTER_MS = 500;
const LATE_AFTER_MS = 4000;
export const DETACHED_GIVE_UP_MS = 60_000;

/** What the robot holds on a target: an accepted value, a value nobody on screen compares, or nothing seen yet. */
export type Known = { value: string } | "unknown" | "never";

export type ActKind = "reconcile" | "oneshot";

/** An act with no definite answer: in flight, answered with no reply, or rate-limited and being retried. */
export type PendingAct = {
  seq: number;
  value: string | null;
  widget: string;
  kind: ActKind;
  engaging: boolean;
  status: "inflight" | "unknown" | "retrying";
  marked: boolean;
};

export type TargetSnapshot = {
  known: Known;
  knownSeq: number;
  /** Who made the act the known value comes from; "stop" or "session" for a server reset. */
  knownBy: string;
  /** The newest unanswered act newer than what is known; the screen is not clean while there is one. */
  pending: PendingAct | null;
  /** The newest act that was accepted or may have been applied, and who made it: ends another control's hold. */
  appliedSeq: number;
  appliedBy: string;
  /** The newest comparable value asked for or known, shown (not confirmed) when nothing better is known. */
  lastValue: string | null;
  newestSeq: number;
};

/** A control's own reconciliation: what it asks for and how that is going. */
export type JobSnapshot = {
  value: string;
  active: boolean;
  marked: boolean;
  late: boolean;
  refused: boolean;
  detail?: string;
  lastActSeq: number;
};

export const MODE_BOTH_KEY = payloadKey({ data: "geometric/both" });
export const NEUTRAL_OFF_KEY = "neutral:off";

type Act = PendingAct & {
  target: string;
  job: Job | null;
  timer?: ReturnType<typeof setTimeout>;
};

type Target = {
  known: Known;
  knownSeq: number;
  knownBy: string;
  appliedSeq: number;
  appliedBy: string;
  lastValue: string | null;
  lastValueSeq: number;
  newestSeq: number;
  acts: Act[];
  snapshot: TargetSnapshot;
};

type Job = {
  key: string;
  widget: string;
  target: string;
  value: string;
  valueKey: string | null;
  neutral: boolean;
  intent: WidgetActionIntent;
  send: WidgetActionIntentHandler;
  generation: number;
  failures: number;
  active: boolean;
  lastActSeq: number;
  detachedAt: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  snapshot: JobSnapshot;
};

const NEVER_SNAPSHOT: TargetSnapshot = {
  known: "never",
  knownSeq: 0,
  knownBy: "",
  pending: null,
  appliedSeq: 0,
  appliedBy: "",
  lastValue: null,
  newestSeq: 0,
};

const targets = new Map<string, Target>();
const jobs = new Map<string, Job>();
const mountedKeys = new Map<string, number>();
const listenersByKey = new Map<string, Set<() => void>>();
const trackedIntents = new WeakSet<object>();
/** Mirrors the api-client's publish sequence: every act is recorded just before its request is built. */
let actCounter = 0;

/** Where a node parameter's state lives, and what a set of it acts on. */
export function parameterTarget(node: string, name: string): string {
  return `param:${node}:${name}`;
}

/** Who made an act: one control in one app. */
export function actorKey(scope: string, widgetId: string): string {
  return `${scope}\u0000${widgetId}`;
}

function jobKey(scope: string, widgetId: string, target: string): string {
  return `${actorKey(scope, widgetId)}\u0000${target}`;
}

function targetKey(target: string): string {
  return `\u0001${target}`;
}

/** The value an intent asks the robot for, comparable across controls; null when nothing compares it. */
export function actValueKey(intent: WidgetActionIntent): string | null {
  if (intent.type === "topic-publish") {
    return payloadKey(intent.payload);
  }
  if (intent.type === "toggle-state") {
    return `value:${String(intent.value)}`;
  }
  return null;
}

/** `{data: 'x'}` as ROS text and `{"data": "x"}` as an object are the same message. */
export function payloadKey(payload: unknown): string {
  const data = stringData(payload);
  if (data !== null) {
    return `data:${data.trim()}`;
  }
  return typeof payload === "string" ? `text:${payload.trim()}` : `json:${stableStringify(payload)}`;
}

function stringData(payload: unknown): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const keys = Object.keys(record);
    return keys.length === 1 && keys[0] === "data" && typeof record.data === "string" ? record.data : null;
  }
  if (typeof payload !== "string") {
    return null;
  }
  try {
    return stringData(JSON.parse(payload));
  } catch {
    return readModeRequestData(payload);
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Whether an intent's act is already recorded here, so the dispatcher does not record it twice. */
export function isReconcilerSend(intent: WidgetActionIntent): boolean {
  return trackedIntents.has(intent);
}

/**
 * The dispatcher's entry point for an act the widgets did not record (a preset, a slider, a parameter set): call it
 * just before the request goes out, and report the outcome to the returned function.
 */
export function beginAct(target: string, intent: WidgetActionIntent): (status: WidgetActionStatus) => void {
  if (trackedIntents.has(intent)) {
    return () => undefined;
  }
  const act = recordAct(target, { value: null, widget: intent.widgetId, kind: "oneshot", engaging: true, job: null });
  return (status) => settleAct(act, status);
}

/** A one-shot publish from a control: recorded, sent once, never retried. */
export function sendOneShot(options: {
  scope?: string;
  widgetId: string;
  target: string;
  intent: WidgetActionIntent;
  send: WidgetActionIntentHandler;
}): void {
  const act = recordAct(options.target, {
    value: null,
    widget: actorKey(options.scope ?? "", options.widgetId),
    kind: "oneshot",
    engaging: true,
    job: null,
  });
  trackedIntents.add(options.intent);
  run(options.send, options.intent, (status) => settleAct(act, status));
}

/** An act applied on a target, with a value nothing on screen compares. */
export function claimTarget(target: string): void {
  settleAct(recordAct(target, { value: null, widget: "", kind: "oneshot", engaging: true, job: null }), "accepted");
}

export function getTargetSnapshot(target: string): TargetSnapshot {
  return targets.get(target)?.snapshot ?? NEVER_SNAPSHOT;
}

export function getJobSnapshot(widgetId: string, target: string, scope = ""): JobSnapshot | null {
  return jobs.get(jobKey(scope, widgetId, target))?.snapshot ?? null;
}

export function useTargetState(target: string): TargetSnapshot {
  const key = targetKey(target);
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => getTargetSnapshot(target),
    () => NEVER_SNAPSHOT,
  );
}

/** An asserted STOP: the server sent geometric/both and switched servoing off, whatever became of our sends. */
export function settleForAssertedStop(): void {
  setKnownBySystem(MODE_REQUEST_TOPIC, MODE_BOTH_KEY, "stop");
  setKnownBySystem(VISUAL_SERVOING_SWITCH_TOPIC, NEUTRAL_OFF_KEY, "stop");
}

/**
 * A new runtime session or lease: the server reset shaping and servoing when the old one ended, nothing else.
 * Pending non-neutral states stop; every other target keeps what it knows.
 */
export function settleForNewSession(): void {
  cancelAllPendingEngaging();
  setKnownBySystem(MODE_REQUEST_TOPIC, MODE_BOTH_KEY, "session");
  setKnownBySystem(VISUAL_SERVOING_SWITCH_TOPIC, NEUTRAL_OFF_KEY, "session");
}

/** No-op: the robot has one state whichever app is open, so leaving an app forgets nothing. */
export function forgetConfirmedValues(_scope: string): void {}

export function setDesired(options: {
  scope?: string;
  widgetId: string;
  target: string;
  value: string;
  engage: boolean;
  momentary?: boolean;
  intent: WidgetActionIntent;
  send: WidgetActionIntentHandler;
}): void {
  const scope = options.scope ?? "";
  const key = jobKey(scope, options.widgetId, options.target);
  let job = jobs.get(key);
  if (!job) {
    job = {
      key,
      widget: actorKey(scope, options.widgetId),
      target: options.target,
      value: options.value,
      valueKey: null,
      neutral: false,
      intent: options.intent,
      send: options.send,
      generation: 0,
      failures: 0,
      active: false,
      lastActSeq: 0,
      detachedAt: Date.now(),
      timers: new Set(),
      snapshot: { value: options.value, active: false, marked: false, late: false, refused: false, lastActSeq: 0 },
    };
    jobs.set(key, job);
  }
  clearTimers(job);
  job.generation += 1;
  job.value = options.value;
  job.valueKey = actValueKey(options.intent);
  job.neutral = isNeutral(options.target, options.value, options.momentary === true);
  job.intent = options.intent;
  job.send = options.send;
  job.failures = 0;
  job.active = true;
  if (!isMounted(job.key)) {
    job.detachedAt = Date.now();
  }
  publishJob(job, { value: options.value, active: true, marked: false, late: false, refused: false });
  const generation = job.generation;
  const current = job;
  schedule(job, MARK_AFTER_MS, () => updateJob(current, generation, { marked: true }));
  schedule(job, LATE_AFTER_MS, () => updateJob(current, generation, { late: true, marked: true }));
  attempt(job, generation);
}

/** A suspend or STOP: this control's pending state is not sent again unless it is neutral. */
export function cancelPending(widgetId: string, target: string, scope = ""): void {
  const job = jobs.get(jobKey(scope, widgetId, target));
  if (job?.active && !job.neutral) {
    endJob(job, {});
  }
}

/** Every pending state, mounted or not: after a suspend or STOP only the neutral ones (servo off, mode release) go on. */
export function cancelAllPendingEngaging(): void {
  for (const job of [...jobs.values()]) {
    if (job.active && !job.neutral) {
      endJob(job, {});
    }
  }
}

/** Mounts a control's reconciliation: the newest handler sends, and an unmounted one finishes within a minute. */
export function useWidgetJob(
  widgetId: string,
  target: string,
  send: WidgetActionIntentHandler | undefined,
  scope = "",
): JobSnapshot | null {
  const key = jobKey(scope, widgetId, target);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const job = jobs.get(key);
    if (job && sendRef.current) {
      job.send = sendRef.current;
    }
  });
  useEffect(() => {
    attachWidget(widgetId, target, scope);
    return () => detachWidget(widgetId, target, scope);
  }, [scope, target, widgetId]);
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => getJobSnapshot(widgetId, target, scope),
    () => null,
  );
}

export function attachWidget(widgetId: string, target: string, scope = ""): void {
  const key = jobKey(scope, widgetId, target);
  mountedKeys.set(key, (mountedKeys.get(key) ?? 0) + 1);
}

export function detachWidget(widgetId: string, target: string, scope = ""): void {
  const key = jobKey(scope, widgetId, target);
  const count = (mountedKeys.get(key) ?? 1) - 1;
  if (count > 0) {
    mountedKeys.set(key, count);
    return;
  }
  mountedKeys.delete(key);
  const job = jobs.get(key);
  if (job) {
    job.detachedAt = Date.now();
    if (!job.active) {
      dropJob(job);
    }
  }
}

/** Clears every target, control and timer; tests only. */
export function resetDesiredStates(): void {
  for (const job of jobs.values()) {
    clearTimers(job);
  }
  for (const state of targets.values()) {
    for (const act of state.acts) {
      clearActTimer(act);
    }
  }
  jobs.clear();
  targets.clear();
  mountedKeys.clear();
}

export type ToggleView = { state: "on" | "off" | null; clean: boolean; pending: PendingAct | null };

/** A toggle reads the target: clean only when what is known is one of its own payloads and nothing newer is out. */
export function readToggle(snapshot: TargetSnapshot, keys: { on: string | null; off: string | null }): ToggleView {
  const toState = (value: string | null) =>
    value === null ? null : value === keys.on ? "on" : value === keys.off || value === NEUTRAL_OFF_KEY ? "off" : null;
  const { known, pending } = snapshot;
  if (pending) {
    return { state: toState(pending.value) ?? toState(snapshot.lastValue), clean: false, pending };
  }
  if (known === "never") {
    return { state: null, clean: true, pending: null };
  }
  const state = known === "unknown" ? null : toState(known.value);
  return state ? { state, clean: true, pending: null } : { state: toState(snapshot.lastValue), clean: false, pending };
}

export type MomentaryView = { pressed: boolean | null; clean: boolean; own: boolean };

/**
 * A hold reads the target too: pressed when its own press is what is known, released when another value is.
 * `pressed: null` leaves it to the control's own hold, clean only when released and nothing is known.
 */
export function readMomentary(snapshot: TargetSnapshot, actor: string, pressKey: string, held: boolean): MomentaryView {
  const { known, pending } = snapshot;
  if (pending) {
    const own = pending.widget === actor;
    return { pressed: own ? pending.value === pressKey : null, clean: false, own };
  }
  if (known === "never" || known === "unknown") {
    return { pressed: null, clean: known === "never" && !held, own: false };
  }
  if (known.value === pressKey && snapshot.knownBy !== actor) {
    // Another control asked for the same mode: this hold did not, so it is not pressed, nor clean.
    return { pressed: null, clean: false, own: false };
  }
  return { pressed: known.value === pressKey, clean: true, own: false };
}

function isNeutral(target: string, value: string, momentary: boolean): boolean {
  return (
    (target === VISUAL_SERVOING_SWITCH_TOPIC && value === "off") ||
    (momentary && value === "released" && target === MODE_REQUEST_TOPIC)
  );
}

function targetOf(target: string): Target {
  let state = targets.get(target);
  if (!state) {
    state = {
      known: "never",
      knownSeq: 0,
      knownBy: "",
      appliedSeq: 0,
      appliedBy: "",
      lastValue: null,
      lastValueSeq: 0,
      newestSeq: 0,
      acts: [],
      snapshot: NEVER_SNAPSHOT,
    };
    targets.set(target, state);
  }
  return state;
}

/** Records an act as the newest on its target: no older act there is retried after it. */
function recordAct(
  target: string,
  spec: { value: string | null; widget: string; kind: ActKind; engaging: boolean; job: Job | null },
): Act {
  const state = targetOf(target);
  actCounter += 1;
  const act: Act = { ...spec, seq: actCounter, target, status: "inflight", marked: false };
  for (const job of [...jobs.values()]) {
    if (job.target === target && job !== spec.job && job.active) {
      endJob(job, {});
    }
  }
  if (spec.job) {
    removeActs(state, (other) => other.job === spec.job && other.status === "retrying");
  }
  state.acts.push(act);
  state.newestSeq = act.seq;
  if (act.value !== null) {
    state.lastValue = act.value;
    state.lastValueSeq = act.seq;
  }
  act.timer = setTimeout(() => {
    act.timer = undefined;
    if (state.acts.includes(act)) {
      act.marked = true;
      refresh(target);
    }
  }, MARK_AFTER_MS);
  refresh(target);
  return act;
}

function settleAct(act: Act, status: WidgetActionStatus): void {
  const state = targets.get(act.target);
  if (!state) {
    return;
  }
  if (status === "accepted") {
    if (act.seq > state.knownSeq) {
      state.known = act.value === null ? "unknown" : { value: act.value };
      state.knownSeq = act.seq;
      state.knownBy = act.widget;
    }
    noteApplied(state, act);
    removeActs(state, (other) => other.seq <= act.seq);
  } else if (status === "unknown") {
    if (act.seq <= state.knownSeq || !state.acts.includes(act)) {
      removeActs(state, (other) => other === act);
    } else {
      act.status = "unknown";
      act.marked = true;
      clearActTimer(act);
      noteApplied(state, act);
      removeActs(
        state,
        (other) =>
          other !== act &&
          other.status === "unknown" &&
          other.seq < act.seq &&
          other.widget === act.widget &&
          other.value === act.value,
      );
    }
  } else if (status === "transient" && act.job?.active && act.job.lastActSeq === act.seq && state.acts.includes(act)) {
    act.status = "retrying";
    act.marked = true;
    clearActTimer(act);
  } else if (status === "superseded") {
    // A newer send was applied: nothing up to this one can change the robot any more.
    removeActs(state, (other) => other.seq <= act.seq);
  } else {
    removeActs(state, (other) => other === act);
  }
  refresh(act.target);
}

function noteApplied(state: Target, act: Act): void {
  if (act.seq > state.appliedSeq) {
    state.appliedSeq = act.seq;
    state.appliedBy = act.widget;
  }
}

function setKnownBySystem(target: string, value: string, by: string): void {
  const state = targetOf(target);
  actCounter += 1;
  for (const job of [...jobs.values()]) {
    if (job.target === target && job.active) {
      endJob(job, {});
    }
  }
  state.known = { value };
  state.knownSeq = actCounter;
  state.knownBy = by;
  state.appliedSeq = actCounter;
  state.appliedBy = by;
  state.newestSeq = actCounter;
  state.lastValue = value;
  state.lastValueSeq = actCounter;
  removeActs(state, () => true);
  refresh(target);
}

function removeActs(state: Target, matches: (act: Act) => boolean): void {
  state.acts = state.acts.filter((act) => {
    if (matches(act)) {
      clearActTimer(act);
      return false;
    }
    return true;
  });
}

function clearActTimer(act: Act): void {
  if (act.timer !== undefined) {
    clearTimeout(act.timer);
    act.timer = undefined;
  }
}

function refresh(target: string): void {
  const state = targets.get(target);
  if (!state) {
    return;
  }
  let pending: Act | null = null;
  for (const act of state.acts) {
    if (act.seq > state.knownSeq && (!pending || act.seq > pending.seq)) {
      pending = act;
    }
  }
  state.snapshot = {
    known: state.known,
    knownSeq: state.knownSeq,
    knownBy: state.knownBy,
    pending: pending
      ? {
          seq: pending.seq,
          value: pending.value,
          widget: pending.widget,
          kind: pending.kind,
          engaging: pending.engaging,
          status: pending.status,
          marked: pending.marked,
        }
      : null,
    appliedSeq: state.appliedSeq,
    appliedBy: state.appliedBy,
    lastValue: state.lastValue,
    newestSeq: state.newestSeq,
  };
  notify(targetKey(target));
}

function attempt(job: Job, generation: number): void {
  if (!isLive(job, generation)) {
    return;
  }
  trackedIntents.add(job.intent);
  const act = recordAct(job.target, {
    value: job.valueKey,
    widget: job.widget,
    kind: "reconcile",
    engaging: !job.neutral,
    job,
  });
  job.lastActSeq = act.seq;
  publishJob(job, { ...job.snapshot, lastActSeq: act.seq });
  run(job.send, job.intent, (status, detail) => {
    settleAct(act, status);
    onJobOutcome(job, act, generation, status, detail);
  });
}

function onJobOutcome(
  job: Job,
  act: Act,
  generation: number,
  status: WidgetActionStatus,
  detail: string | undefined,
): void {
  if (jobs.get(job.key) !== job || job.lastActSeq !== act.seq) {
    return;
  }
  if (!isLive(job, generation)) {
    if (status === "refused") {
      publishJob(job, { ...job.snapshot, refused: true, ...(detail ? { detail } : {}) });
    }
    return;
  }
  if (status === "accepted" || status === "superseded") {
    endJob(job, {});
    return;
  }
  if (status === "refused") {
    endJob(job, { refused: true, detail });
    return;
  }
  job.failures += 1;
  if (!isMounted(job.key) && Date.now() - job.detachedAt >= DETACHED_GIVE_UP_MS) {
    console.warn(`Bloom gave up confirming ${job.target} after ${DETACHED_GIVE_UP_MS / 1000} s.`, detail ?? "");
    endJob(job, {});
    dropJob(job);
    return;
  }
  publishJob(job, { ...job.snapshot, marked: true, ...(detail ? { detail } : {}) });
  const delay = RETRY_DELAYS_MS[job.failures - 1] ?? STEADY_RETRY_MS;
  schedule(job, delay, () => attempt(job, generation));
}

/** No more sends from this control; an act of it still unanswered keeps counting on the target. */
function endJob(job: Job, change: { refused?: boolean; detail?: string }): void {
  clearTimers(job);
  job.generation += 1;
  job.active = false;
  const state = targets.get(job.target);
  if (state) {
    removeActs(state, (act) => act.job === job && act.status === "retrying");
    refresh(job.target);
  }
  const { detail: previous, ...rest } = job.snapshot;
  const detail = change.refused ? change.detail : previous;
  publishJob(job, { ...rest, active: false, refused: change.refused === true, ...(detail ? { detail } : {}) });
  if (!isMounted(job.key)) {
    dropJob(job);
  }
}

function run(
  send: WidgetActionIntentHandler,
  intent: WidgetActionIntent,
  done: (status: WidgetActionStatus, detail: string | undefined) => void,
): void {
  let outcome: ReturnType<WidgetActionIntentHandler>;
  try {
    outcome = send(intent);
  } catch (error: unknown) {
    done("unknown", describe(error));
    return;
  }
  if (outcome instanceof Promise) {
    outcome.then(
      (result) => done(...classify(result)),
      (error: unknown) => done("unknown", describe(error)),
    );
    return;
  }
  done(...classify(outcome));
}

function classify(outcome: WidgetActionOutcome | undefined): [WidgetActionStatus, string | undefined] {
  if (outcome === undefined) {
    return ["accepted", undefined];
  }
  return [outcome.status ?? (outcome.accepted ? "accepted" : "refused"), outcome.detail];
}

function isMounted(key: string): boolean {
  return (mountedKeys.get(key) ?? 0) > 0;
}

function isLive(job: Job, generation: number): boolean {
  return jobs.get(job.key) === job && job.generation === generation && job.active;
}

function updateJob(job: Job, generation: number, change: Partial<JobSnapshot>): void {
  if (isLive(job, generation)) {
    publishJob(job, { ...job.snapshot, ...change });
  }
}

function dropJob(job: Job): void {
  clearTimers(job);
  if (jobs.get(job.key) === job) {
    jobs.delete(job.key);
    notify(job.key);
  }
}

function publishJob(job: Job, snapshot: Omit<JobSnapshot, "lastActSeq"> & { lastActSeq?: number }): void {
  job.snapshot = { ...snapshot, lastActSeq: job.lastActSeq };
  notify(job.key);
}

function notify(key: string): void {
  for (const listener of [...(listenersByKey.get(key) ?? [])]) {
    listener();
  }
}

function subscribe(key: string, listener: () => void): () => void {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByKey.delete(key);
    }
  };
}

function schedule(job: Job, delay: number, task: () => void): void {
  const timer = setTimeout(() => {
    job.timers.delete(timer);
    task();
  }, delay);
  job.timers.add(timer);
}

function clearTimers(job: Job): void {
  for (const timer of job.timers) {
    clearTimeout(timer);
  }
  job.timers.clear();
}

function describe(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
