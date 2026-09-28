import type { WidgetActionIntent } from "@bloom/widgets";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { WidgetActionIntentHandler, WidgetActionOutcome, WidgetActionStatus } from "./types";

/**
 * ADR 0141: a stateful control keeps sending its desired absolute payload while the robot may not have it.
 * Entries live at module level, so an unmounted control's last desired state still gets finished.
 */
export type DesiredSnapshot = {
  /** What the control shows; null means its own resting state, nothing having been confirmed. */
  value: string | null;
  confirmed: boolean;
  /** The screen says "Not confirmed": a send got no reply or a transient refusal, or the reply is late. */
  marked: boolean;
  /** The fast retries are spent: "Robot has not confirmed". */
  late: boolean;
  /** A send was refused or cancelled, so nothing more is sent: the control shows its last confirmed state. */
  refused: boolean;
  detail?: string;
};

const RETRY_DELAYS_MS = [250, 500, 1000, 2000] as const;
const STEADY_RETRY_MS = 2000;
const MARK_AFTER_MS = 500;
const LATE_AFTER_MS = 4000;
export const DETACHED_GIVE_UP_MS = 60_000;

type Entry = {
  key: string;
  /** The app and configuration the control belongs to: an entry never adopts into, or sends for, another. */
  scope: string;
  target: string;
  value: string;
  /** On, pressed or a mode: dropped when refused or cancelled. Off and release states are not. */
  engage: boolean;
  intent: WidgetActionIntent;
  send: WidgetActionIntentHandler;
  generation: number;
  failures: number;
  inFlight: boolean;
  cancelled: boolean;
  /** The newest unanswered send's value, so the robot may hold it; cleared by a newer accepted send. */
  uncertainValue: string | null;
  uncertainSeq: number;
  /** Sends not answered yet, by sequence: a stopped control may still be applied by one. */
  open: Map<number, string>;
  lastConfirmed: string | null;
  confirmedSeq: number;
  /** No more sends: settled, refused, cancelled or claimed. */
  idle: boolean;
  /** Idle without an accepted send: it shows its last confirmed state or an unanswered one. */
  stopped: boolean;
  /** Stopped by a newer act of another control on its target. */
  claimed: boolean;
  detachedAt: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  snapshot: DesiredSnapshot;
};

const entries = new Map<string, Entry>();
let attemptSeq = 0;
const listenersByKey = new Map<string, Set<() => void>>();
const mountedKeys = new Map<string, number>();

function desiredKey(scope: string, widgetId: string, target: string): string {
  return `${scope}\u0000${widgetId}\u0000${target}`;
}

/**
 * The newest act on a target wins: another control's pending state there stops at once and shows its last
 * confirmed state, or stays not confirmed if a send of it got no reply.
 */
export function claimTarget(target: string, exceptKey?: string): void {
  for (const entry of [...entries.values()]) {
    if (entry.target === target && entry.key !== exceptKey && !entry.snapshot.confirmed) {
      stop(entry, undefined, false);
      entry.claimed = true;
    }
  }
}

export function setDesired(options: {
  scope?: string;
  widgetId: string;
  target: string;
  value: string;
  engage: boolean;
  intent: WidgetActionIntent;
  send: WidgetActionIntentHandler;
}): void {
  const scope = options.scope ?? "";
  const key = desiredKey(scope, options.widgetId, options.target);
  claimTarget(options.target, key);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      key,
      scope,
      target: options.target,
      value: options.value,
      engage: options.engage,
      intent: options.intent,
      send: options.send,
      generation: 0,
      failures: 0,
      inFlight: false,
      cancelled: false,
      uncertainValue: null,
      uncertainSeq: 0,
      open: new Map(),
      lastConfirmed: null,
      confirmedSeq: 0,
      idle: false,
      stopped: false,
      claimed: false,
      detachedAt: Date.now(),
      timers: new Set(),
      snapshot: { value: options.value, confirmed: false, marked: false, late: false, refused: false },
    };
    entries.set(key, entry);
  }
  clearTimers(entry);
  entry.generation += 1;
  entry.failures = 0;
  entry.cancelled = false;
  entry.idle = false;
  entry.stopped = false;
  entry.claimed = false;
  entry.value = options.value;
  entry.engage = options.engage;
  entry.intent = options.intent;
  entry.send = options.send;
  if (!isMounted(entry)) {
    entry.detachedAt = Date.now();
  }
  publish(entry, { value: options.value, confirmed: false, marked: false, late: false, refused: false });
  const generation = entry.generation;
  const current = entry;
  schedule(entry, MARK_AFTER_MS, () => update(current, generation, { marked: true }));
  schedule(entry, LATE_AFTER_MS, () => update(current, generation, { late: true, marked: true }));
  attempt(entry, generation);
}

/**
 * A suspend or STOP: a pending engaging state is not sent again. It reads "not confirmed" if a send got no
 * reply, otherwise the last confirmed state. Off and release states keep going.
 */
export function cancelPending(widgetId: string, target: string, scope = ""): void {
  const entry = entries.get(desiredKey(scope, widgetId, target));
  if (entry) {
    cancel(entry);
  }
}

/** Every pending engaging state, mounted or not: after a suspend or STOP only off and release states finish. */
export function cancelAllPendingEngaging(): void {
  for (const entry of [...entries.values()]) {
    cancel(entry);
  }
}

/** Drops a settled entry, so a read-back from the robot speaks again. */
export function forgetSettled(widgetId: string, target: string, scope = ""): void {
  const entry = entries.get(desiredKey(scope, widgetId, target));
  if (entry?.snapshot.confirmed) {
    drop(entry);
  }
}

/** The control's desired state, kept sending through its newest handler while mounted and finished after. */
export function useDesiredState(
  widgetId: string,
  target: string,
  send: WidgetActionIntentHandler | undefined,
  scope = "",
): DesiredSnapshot | null {
  const key = desiredKey(scope, widgetId, target);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const entry = entries.get(key);
    if (entry && sendRef.current) {
      entry.send = sendRef.current;
    }
  });
  useEffect(() => {
    mountedKeys.set(key, (mountedKeys.get(key) ?? 0) + 1);
    return () => {
      const count = (mountedKeys.get(key) ?? 1) - 1;
      if (count > 0) {
        mountedKeys.set(key, count);
      } else {
        mountedKeys.delete(key);
      }
      const current = entries.get(key);
      if (current) {
        detach(current);
      }
    };
  }, [key]);
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => entries.get(key)?.snapshot ?? null,
    () => null,
  );
}

/** Clears every entry and timer; tests only. */
export function resetDesiredStates(): void {
  for (const entry of entries.values()) {
    clearTimers(entry);
  }
  entries.clear();
  mountedKeys.clear();
}

function cancel(entry: Entry): void {
  if (entry.idle || !entry.engage || entry.cancelled) {
    return;
  }
  entry.cancelled = true;
  clearTimers(entry);
  if (!entry.inFlight) {
    stop(entry, entry.snapshot.detail, true);
  }
}

function isMounted(entry: Entry): boolean {
  return (mountedKeys.get(entry.key) ?? 0) > 0;
}

function detach(entry: Entry): void {
  if (isMounted(entry)) {
    return;
  }
  entry.detachedAt = Date.now();
  if (entry.snapshot.confirmed) {
    drop(entry);
  }
}

function attempt(entry: Entry, generation: number): void {
  if (!isLive(entry, generation)) {
    return;
  }
  entry.inFlight = true;
  attemptSeq += 1;
  const sent = { generation, seq: attemptSeq, value: entry.value };
  entry.open.set(sent.seq, sent.value);
  let outcome: ReturnType<WidgetActionIntentHandler>;
  try {
    outcome = entry.send(entry.intent);
  } catch (error: unknown) {
    finish(entry, sent, "unknown", describe(error));
    return;
  }
  if (outcome instanceof Promise) {
    outcome.then(
      (result) => finish(entry, sent, ...classify(result)),
      (error: unknown) => finish(entry, sent, "unknown", describe(error)),
    );
    return;
  }
  finish(entry, sent, ...classify(outcome));
}

type Sent = { generation: number; seq: number; value: string };

function finish(entry: Entry, sent: Sent, status: WidgetActionStatus, detail: string | undefined): void {
  if (entries.get(entry.key) !== entry) {
    return;
  }
  entry.open.delete(sent.seq);
  // Every answer counts, even to an older send: the server applies them in send order.
  if (status === "accepted" && sent.seq > entry.confirmedSeq) {
    entry.lastConfirmed = sent.value;
    entry.confirmedSeq = sent.seq;
    if (entry.uncertainSeq <= sent.seq) {
      entry.uncertainValue = null;
    }
  } else if (status === "unknown" && sent.seq > entry.confirmedSeq && sent.seq > entry.uncertainSeq) {
    entry.uncertainValue = sent.value;
    entry.uncertainSeq = sent.seq;
  }
  if (entry.generation !== sent.generation) {
    if (entry.stopped) {
      showIdle(entry, entry.snapshot.refused, entry.snapshot.detail);
      if (entry.snapshot.confirmed && !isMounted(entry)) {
        drop(entry);
      }
    }
    return;
  }
  entry.inFlight = false;
  if (status === "accepted" || status === "superseded") {
    settle(entry);
    if (status === "accepted") {
      releaseClaimed(entry);
    }
    if (!isMounted(entry)) {
      drop(entry);
    }
    return;
  }
  // An explicit refusal was not applied; only no reply or a transient refusal is worth sending again.
  if (status === "refused" || entry.cancelled) {
    stop(entry, detail, true);
    return;
  }
  entry.failures += 1;
  if (!isMounted(entry) && Date.now() - entry.detachedAt >= DETACHED_GIVE_UP_MS) {
    console.warn(`Bloom gave up confirming ${entry.target} after ${DETACHED_GIVE_UP_MS / 1000} s.`, detail ?? "");
    drop(entry);
    return;
  }
  publish(entry, { ...entry.snapshot, marked: true, ...(detail ? { detail } : {}) });
  const delay = RETRY_DELAYS_MS[entry.failures - 1] ?? STEADY_RETRY_MS;
  schedule(entry, delay, () => attempt(entry, sent.generation));
}

/** No more sends: not confirmed if an unanswered send may hold, else the last confirmed state. */
function stop(entry: Entry, detail: string | undefined, refused: boolean): void {
  clearTimers(entry);
  entry.generation += 1;
  entry.inFlight = false;
  entry.idle = true;
  entry.stopped = true;
  showIdle(entry, refused, detail);
  if (entry.snapshot.confirmed && !isMounted(entry)) {
    drop(entry);
  }
}

function showIdle(entry: Entry, refused: boolean, detail: string | undefined): void {
  const withDetail = detail ? { detail } : {};
  const unanswered = entry.uncertainValue ?? newestOpenValue(entry);
  if (unanswered !== null) {
    publish(entry, {
      value: unanswered,
      confirmed: false,
      marked: true,
      late: entry.snapshot.late,
      refused: false,
      ...withDetail,
    });
    return;
  }
  publish(entry, { value: entry.lastConfirmed, confirmed: true, marked: false, late: false, refused, ...withDetail });
}

function newestOpenValue(entry: Entry): string | null {
  let newest: [number, string] | null = null;
  for (const [seq, value] of entry.open) {
    if (seq > entry.confirmedSeq && (!newest || seq > newest[0])) {
      newest = [seq, value];
    }
  }
  return newest ? newest[1] : null;
}

/** A newer accepted send on the target defines it: controls it stopped there fall back to their own state. */
function releaseClaimed(winner: Entry): void {
  for (const entry of [...entries.values()]) {
    if (entry !== winner && entry.target === winner.target && entry.claimed) {
      drop(entry);
    }
  }
}

function classify(outcome: WidgetActionOutcome | undefined): [WidgetActionStatus, string | undefined] {
  if (outcome === undefined) {
    return ["accepted", undefined];
  }
  return [outcome.status ?? (outcome.accepted ? "accepted" : "refused"), outcome.detail];
}

function settle(entry: Entry): void {
  clearTimers(entry);
  entry.generation += 1;
  entry.inFlight = false;
  entry.idle = true;
  entry.stopped = false;
  publish(entry, { value: entry.value, confirmed: true, marked: false, late: false, refused: false });
}

function update(entry: Entry, generation: number, change: Partial<DesiredSnapshot>): void {
  if (isLive(entry, generation) && !entry.snapshot.confirmed) {
    publish(entry, { ...entry.snapshot, ...change });
  }
}

function isLive(entry: Entry, generation: number): boolean {
  return entries.get(entry.key) === entry && entry.generation === generation;
}

function drop(entry: Entry): void {
  clearTimers(entry);
  entry.generation += 1;
  entries.delete(entry.key);
  notify(entry.key);
}

function publish(entry: Entry, snapshot: DesiredSnapshot): void {
  entry.snapshot = snapshot;
  notify(entry.key);
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

function schedule(entry: Entry, delay: number, run: () => void): void {
  const timer = setTimeout(() => {
    entry.timers.delete(timer);
    run();
  }, delay);
  entry.timers.add(timer);
}

function clearTimers(entry: Entry): void {
  for (const timer of entry.timers) {
    clearTimeout(timer);
  }
  entry.timers.clear();
}

function describe(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
