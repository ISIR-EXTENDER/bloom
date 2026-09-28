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
  /** A newer act of another control owns the target: a hold ends here, without sending its release. */
  claimed?: boolean;
  detail?: string;
};

export const VISUAL_SERVOING_SWITCH_TOPIC = "/ui/visual_servoing/on";
const MODE_REQUEST_TOPIC = "/mode_request";

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
  /** A hold (pressed or released), which a newer act on its target ends even once confirmed. */
  momentary: boolean;
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
  /** The target's claim sequence at this control's newest act. */
  actSeq: number;
  detachedAt: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  snapshot: DesiredSnapshot;
};

const entries = new Map<string, Entry>();
let attemptSeq = 0;
const listenersByKey = new Map<string, Set<() => void>>();
const mountedKeys = new Map<string, number>();
/** The last accepted value per scope and target; it outlives the control that sent it (ADR 0141). */
const confirmedByTarget = new Map<string, ConfirmedRecord>();
/** The newest act per target, in send sequence: an accept of an older send no longer says what the robot has. */
const claimSeqByTarget = new Map<string, number>();

/** A value accepted on a target; `unknown` once a newer publish there claimed it without reporting back. */
export type ConfirmedRecord = { scope: string; target: string; value: string; seq: number; unknown?: boolean };

/** Where a node parameter's desired and confirmed state live, and what a set of it claims. */
export function parameterTarget(node: string, name: string): string {
  return `param:${node}:${name}`;
}
const reconcilerIntents = new WeakSet<object>();

function desiredKey(scope: string, widgetId: string, target: string): string {
  return `${scope}\u0000${widgetId}\u0000${target}`;
}

function confirmedKey(scope: string, target: string): string {
  return `\u0001${scope}\u0000${target}`;
}

/** Whether a send comes from the reconciler rather than a new operator act. */
export function isReconcilerSend(intent: WidgetActionIntent): boolean {
  return reconcilerIntents.has(intent);
}

/**
 * A publish that is not a control's desired state (a one-shot, a preset, a slider) is the newest act on its
 * target: controls there stop, and what they last confirmed is no longer known.
 */
export function claimTarget(target: string): void {
  const seq = claim(target);
  for (const entry of [...entries.values()]) {
    if (entry.target !== target || entry.momentary || !entry.idle || entry.stopped || !entry.snapshot.confirmed) {
      continue;
    }
    // The mode highlight follows the mode ledger, not a button's own send.
    if (target === MODE_REQUEST_TOPIC) {
      drop(entry);
    } else {
      entry.claimed = true;
      entry.stopped = true;
      showIdle(entry, false, undefined);
    }
  }
  for (const [key, confirmed] of [...confirmedByTarget]) {
    if (confirmed.target === target) {
      confirmedByTarget.set(key, { ...confirmed, seq, unknown: true });
      notify(key);
    }
  }
}

/**
 * The newest act on a target wins: another control's pending state there stops at once and shows its last
 * confirmed state, or stays not confirmed if a send of it got no reply. A confirmed hold ends without a release.
 */
function claim(target: string, exceptKey?: string): number {
  attemptSeq += 1;
  claimSeqByTarget.set(target, attemptSeq);
  for (const entry of [...entries.values()]) {
    if (entry.target !== target || entry.key === exceptKey) {
      continue;
    }
    if (!entry.snapshot.confirmed) {
      entry.claimed = true;
      stop(entry, undefined, false);
    } else if (entry.momentary && entry.value === "pressed" && !entry.claimed) {
      entry.claimed = true;
      publish(entry, { value: null, confirmed: true, marked: false, late: false, refused: false, claimed: true });
    }
  }
  return attemptSeq;
}

/** The last accepted record on a target, marked unknown once a newer publish claimed it. */
export function useConfirmedRecord(target: string, scope = ""): ConfirmedRecord | null {
  const key = confirmedKey(scope, target);
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => confirmedByTarget.get(key) ?? null,
    () => null,
  );
}

/**
 * A new runtime session or lease: the server neutralised what the old one set, so nothing confirmed before
 * still holds, in any app. Pending states keep going, but no longer fall back to an old confirmed value.
 */
export function forgetAllConfirmedState(): void {
  for (const key of [...confirmedByTarget.keys()]) {
    confirmedByTarget.delete(key);
    notify(key);
  }
  for (const entry of [...entries.values()]) {
    if (entry.snapshot.confirmed) {
      drop(entry);
    } else {
      entry.lastConfirmed = null;
    }
  }
}

/** A runtime session over: what its controls confirmed no longer seeds new ones. */
export function forgetConfirmedValues(scope: string): void {
  for (const [key, confirmed] of [...confirmedByTarget]) {
    if (confirmed.scope === scope) {
      confirmedByTarget.delete(key);
      notify(key);
    }
  }
}

/**
 * An asserted STOP switched servoing off and sent geometric/both on the server: the servo switch reads off and a
 * Snake hold released, confirmed, whatever became of their own refused sends.
 */
export function settleForAssertedStop(): void {
  for (const entry of [...entries.values()]) {
    if (entry.target === VISUAL_SERVOING_SWITCH_TOPIC) {
      markConfirmed(entry, "off", false);
    } else if (entry.momentary && entry.target === MODE_REQUEST_TOPIC) {
      markConfirmed(entry, "released", true);
    }
  }
  for (const [key, confirmed] of [...confirmedByTarget]) {
    if (confirmed.target === VISUAL_SERVOING_SWITCH_TOPIC) {
      confirmedByTarget.set(key, { ...confirmed, value: "off", seq: attemptSeq, unknown: false });
      notify(key);
    } else if (confirmed.target === MODE_REQUEST_TOPIC) {
      confirmedByTarget.delete(key);
      notify(key);
    }
  }
}

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
  const key = desiredKey(scope, options.widgetId, options.target);
  const actSeq = claim(options.target, key);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      key,
      scope,
      target: options.target,
      value: options.value,
      engage: options.engage,
      momentary: options.momentary === true,
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
      actSeq,
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
  entry.actSeq = actSeq;
  entry.value = options.value;
  entry.engage = options.engage;
  entry.momentary = options.momentary === true;
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
 * A suspend or STOP: a pending state is not sent again. It reads "not confirmed" if a send got no reply,
 * otherwise the last confirmed state. Only the neutral states (servo off, a mode hold's release) keep going.
 */
export function cancelPending(widgetId: string, target: string, scope = ""): void {
  const entry = entries.get(desiredKey(scope, widgetId, target));
  if (entry) {
    cancel(entry);
  }
}

/** Every pending state, mounted or not: after a suspend or STOP only the neutral states finish. */
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
  confirmedByTarget.clear();
  claimSeqByTarget.clear();
}

function cancel(entry: Entry): void {
  if (entry.idle || isNeutral(entry) || entry.cancelled) {
    return;
  }
  entry.cancelled = true;
  clearTimers(entry);
  if (!entry.inFlight) {
    stop(entry, entry.snapshot.detail, true);
  }
}

/** What a STOP itself asks for: servoing off, a mode hold released. Other releases may actuate. */
function isNeutral(entry: Entry): boolean {
  return (
    (entry.target === VISUAL_SERVOING_SWITCH_TOPIC && entry.value === "off") ||
    (entry.momentary && entry.value === "released" && entry.target === MODE_REQUEST_TOPIC)
  );
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
  reconcilerIntents.add(entry.intent);
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
    recordConfirmed(entry, sent);
  } else if (status === "superseded") {
    // A newer send was applied on the target after this one, so nothing this control sent before it holds.
    if (entry.uncertainSeq < sent.seq) {
      entry.uncertainValue = null;
    }
    for (const seq of [...entry.open.keys()]) {
      if (seq < sent.seq) {
        entry.open.delete(seq);
      }
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
  if (status === "accepted") {
    settle(entry);
    releaseClaimed(entry);
    if (!isMounted(entry)) {
      drop(entry);
    }
    return;
  }
  // Another send owns the target: the last confirmed state shows, and the claiming act decides.
  if (status === "superseded") {
    entry.claimed = true;
    stop(entry, undefined, false);
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
  const claimedMark = entry.claimed ? { claimed: true } : {};
  const unanswered = entry.uncertainValue ?? newestOpenValue(entry);
  if (unanswered === null && isOvertaken(entry)) {
    publish(entry, {
      value: entry.lastConfirmed,
      confirmed: false,
      marked: true,
      late: false,
      refused: false,
      claimed: true,
      ...withDetail,
    });
    return;
  }
  if (unanswered !== null) {
    publish(entry, {
      value: unanswered,
      confirmed: false,
      marked: true,
      late: entry.snapshot.late,
      refused: false,
      ...claimedMark,
      ...withDetail,
    });
    return;
  }
  publish(entry, {
    value: entry.lastConfirmed,
    confirmed: true,
    marked: false,
    late: false,
    refused,
    ...claimedMark,
    ...withDetail,
  });
}

/** A newer act claimed the target after this control's own: what it confirmed may no longer hold. */
function isOvertaken(entry: Entry): boolean {
  if (!entry.claimed || entry.target === MODE_REQUEST_TOPIC) {
    return false;
  }
  const claimSeq = claimSeqByTarget.get(entry.target) ?? 0;
  return claimSeq > entry.actSeq && claimSeq > entry.confirmedSeq;
}

function markConfirmed(entry: Entry, value: string, claimed: boolean): void {
  clearTimers(entry);
  entry.generation += 1;
  entry.inFlight = false;
  entry.idle = true;
  entry.stopped = false;
  entry.value = value;
  entry.lastConfirmed = value;
  entry.confirmedSeq = attemptSeq;
  entry.uncertainValue = null;
  entry.open.clear();
  entry.claimed = claimed;
  publish(entry, {
    value,
    confirmed: true,
    marked: false,
    late: false,
    refused: false,
    ...(claimed ? { claimed } : {}),
  });
  if (!isMounted(entry)) {
    drop(entry);
  }
}

/** The newest accepted value on the target; other settled controls there stop showing their own. */
function recordConfirmed(entry: Entry, sent: Sent): void {
  const key = confirmedKey(entry.scope, entry.target);
  const current = confirmedByTarget.get(key);
  if ((current && current.seq > sent.seq) || sent.seq < (claimSeqByTarget.get(entry.target) ?? 0)) {
    return;
  }
  confirmedByTarget.set(key, { scope: entry.scope, target: entry.target, value: sent.value, seq: sent.seq });
  notify(key);
  for (const other of [...entries.values()]) {
    if (
      other !== entry &&
      other.scope === entry.scope &&
      other.target === entry.target &&
      !other.momentary &&
      other.idle &&
      !other.stopped &&
      other.snapshot.confirmed
    ) {
      drop(other);
    }
  }
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
      if (entry.momentary && isMounted(entry)) {
        // Kept while mounted, so the hold still learns it ended and sends no release.
        publish(entry, { value: null, confirmed: true, marked: false, late: false, refused: false, claimed: true });
      } else {
        drop(entry);
      }
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
