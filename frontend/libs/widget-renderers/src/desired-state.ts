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
  /** The robot refused an engaging state, which was dropped: the control shows its last confirmed one. */
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
  /** A send of this control got no reply, so the robot may hold it; cleared by an accepted send. */
  uncertain: boolean;
  lastConfirmed: string | null;
  detachedAt: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  snapshot: DesiredSnapshot;
};

const entries = new Map<string, Entry>();
const listenersByKey = new Map<string, Set<() => void>>();
const mountedKeys = new Map<string, number>();

function desiredKey(widgetId: string, target: string): string {
  return `${widgetId}\u0000${target}`;
}

/** The newest act on a target wins: an unconfirmed desired state of another control there stops at once. */
export function claimTarget(target: string, exceptKey?: string): void {
  for (const entry of [...entries.values()]) {
    if (entry.target === target && entry.key !== exceptKey && !entry.snapshot.confirmed) {
      settle(entry);
      if (!isMounted(entry)) {
        drop(entry);
      }
    }
  }
}

export function setDesired(options: {
  widgetId: string;
  target: string;
  value: string;
  engage: boolean;
  intent: WidgetActionIntent;
  send: WidgetActionIntentHandler;
}): void {
  const key = desiredKey(options.widgetId, options.target);
  claimTarget(options.target, key);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      key,
      target: options.target,
      value: options.value,
      engage: options.engage,
      intent: options.intent,
      send: options.send,
      generation: 0,
      failures: 0,
      inFlight: false,
      cancelled: false,
      uncertain: false,
      lastConfirmed: null,
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
export function cancelPending(widgetId: string, target: string): void {
  const entry = entries.get(desiredKey(widgetId, target));
  if (!entry || entry.snapshot.confirmed || !entry.engage || entry.cancelled) {
    return;
  }
  entry.cancelled = true;
  clearTimers(entry);
  if (!entry.inFlight) {
    stop(entry, entry.snapshot.detail);
  }
}

/** Drops a settled entry, so a read-back from the robot speaks again. */
export function forgetSettled(widgetId: string, target: string): void {
  const entry = entries.get(desiredKey(widgetId, target));
  if (entry?.snapshot.confirmed) {
    drop(entry);
  }
}

/** The control's desired state, kept sending through its newest handler while mounted and finished after. */
export function useDesiredState(
  widgetId: string,
  target: string,
  send: WidgetActionIntentHandler | undefined,
): DesiredSnapshot | null {
  const key = desiredKey(widgetId, target);
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
  let outcome: ReturnType<WidgetActionIntentHandler>;
  try {
    outcome = entry.send(entry.intent);
  } catch (error: unknown) {
    finish(entry, generation, "unknown", describe(error));
    return;
  }
  if (outcome instanceof Promise) {
    outcome.then(
      (result) => finish(entry, generation, ...classify(result)),
      (error: unknown) => finish(entry, generation, "unknown", describe(error)),
    );
    return;
  }
  finish(entry, generation, ...classify(outcome));
}

function finish(entry: Entry, generation: number, status: WidgetActionStatus, detail: string | undefined): void {
  if (!isLive(entry, generation)) {
    return;
  }
  entry.inFlight = false;
  if (status === "accepted" || status === "superseded") {
    if (status === "accepted") {
      entry.uncertain = false;
      entry.lastConfirmed = entry.value;
    }
    settle(entry);
    if (!isMounted(entry)) {
      drop(entry);
    }
    return;
  }
  if (status === "unknown") {
    entry.uncertain = true;
  }
  // An explicit refusal was not applied; only no reply or a transient refusal is worth sending again.
  if (status === "refused" || entry.cancelled) {
    stop(entry, detail);
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
  schedule(entry, delay, () => attempt(entry, generation));
}

/** No more sends: unconfirmed if the robot may hold it, else the last confirmed state (engaging) or the asked one. */
function stop(entry: Entry, detail: string | undefined): void {
  clearTimers(entry);
  entry.generation += 1;
  entry.inFlight = false;
  const withDetail = detail ? { detail } : {};
  if (entry.uncertain) {
    publish(entry, {
      ...entry.snapshot,
      value: entry.value,
      confirmed: false,
      marked: true,
      refused: false,
      ...withDetail,
    });
    return;
  }
  if (!entry.engage) {
    entry.lastConfirmed = entry.value;
  }
  publish(entry, {
    value: entry.engage ? entry.lastConfirmed : entry.value,
    confirmed: true,
    marked: false,
    late: false,
    refused: entry.engage,
    ...withDetail,
  });
  if (!isMounted(entry)) {
    drop(entry);
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
