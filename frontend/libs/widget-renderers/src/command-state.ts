import type { CommandStateEntry, RuntimeCommandStateMessage } from "@bloom/api-client";
import { isRecord, normalizeModeRequest, parseModeRequest } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { WidgetActionOutcome } from "./types";

// ADR 0142: the backend owns command state; screens render its snapshot and nothing else.

export const MODE_REQUEST_TOPIC = "/mode_request";
export const VISUAL_SERVOING_SWITCH_TOPIC = "/ui/visual_servoing/on";
export const SERVOING_ACTIVE_KEY = "servoing:active";
export const DIGITAL_OUTPUT_TOPIC = "/hub/digital_output";
export const PRESS_SENDING_MS = 3000;

export type CommandStateMessage = RuntimeCommandStateMessage;

type StoreState = {
  connected: boolean;
  revision: number;
  self: string;
  snapshot: Readonly<Record<string, CommandStateEntry>>;
};

const EMPTY: StoreState = { connected: false, revision: -1, self: "", snapshot: {} };
let state: StoreState = EMPTY;
const listeners = new Set<() => void>();

/** Replaces the snapshot wholesale; an older revision than the one held is a late message and is dropped. */
export function applyCommandStateMessage(message: CommandStateMessage): void {
  if (state.connected && message.revision < state.revision) {
    return;
  }
  const snapshot: Record<string, CommandStateEntry> = {};
  for (const [key, entry] of Object.entries(message.snapshot ?? {})) {
    const held = state.snapshot[key];
    // Unchanged entries keep their identity, so a periodic push re-renders nothing.
    snapshot[key] = held && sameEntry(held, entry) ? held : entry;
  }
  state = { connected: true, revision: message.revision, self: message.self ?? state.self, snapshot };
  notify();
}

/** A closed socket or a new session: everything is unknown until the next snapshot. */
export function clearCommandState(): void {
  if (state === EMPTY) {
    return;
  }
  state = EMPTY;
  notify();
}

export function getCommandStateEntry(key: string): CommandStateEntry | null {
  return state.snapshot[key] ?? null;
}

export function getCommandStateRevision(): number {
  return state.revision;
}

export function subscribeCommandState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One key's entry; null when the store holds nothing for it. */
export function useCommandState(key: string | null): CommandStateEntry | null {
  return useSyncExternalStore(
    subscribeCommandState,
    () => (key ? getCommandStateEntry(key) : null),
    () => null,
  );
}

/** The whole store, for a control that reads several keys. */
export function useCommandStateStore(): StoreState {
  return useSyncExternalStore(
    subscribeCommandState,
    () => state,
    () => EMPTY,
  );
}

/** A value the store holds and knows: an `unknown` entry is no value at all. */
export function knownValue(entry: CommandStateEntry | null): { value: unknown } | null {
  return entry && entry.source !== "unknown" ? { value: entry.value } : null;
}

function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function sameEntry(a: CommandStateEntry, b: CommandStateEntry): boolean {
  return (
    a.revision === b.revision &&
    a.source === b.source &&
    a.by === b.by &&
    a.updated_at === b.updated_at &&
    sameValue(a.value, b.value)
  );
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  if (isRecord(a) && isRecord(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
  }
  return false;
}

// Normalisation: the shape the backend's normalize_payload and mode-request normalisation reduce a payload to.

const FLOAT_TYPES = new Set(["std_msgs/msg/Float32", "std_msgs/msg/Float64"]);
const INT_TYPES = new Set(
  ["Int", "UInt"].flatMap((kind) => ["8", "16", "32", "64"].map((bits) => `std_msgs/msg/${kind}${bits}`)),
);
const NUMBER_ARRAY_TYPES = new Set([...FLOAT_TYPES, ...INT_TYPES].map((type) => `${type}MultiArray`));

/** A payload as the store holds it after a publish; undefined when it cannot be read. */
export function normalizeCommandPayload(topic: string, messageType: string | undefined, payload: unknown): unknown {
  const parsed = typeof payload === "string" ? parsePayloadText(payload) : payload;
  if (parsed === undefined) {
    return undefined;
  }
  const record = isRecord(parsed) && !Array.isArray(parsed) ? parsed : { data: parsed };
  const data = record.data;
  if (isModeRequestTopic(topic) && typeof data === "string") {
    return { ...record, data: normalizeModeRequest(data) };
  }
  if (messageType === "std_msgs/msg/String" && typeof data === "string") {
    return { data };
  }
  if (messageType === "std_msgs/msg/Bool" && typeof data === "boolean") {
    return { data };
  }
  if (messageType && (FLOAT_TYPES.has(messageType) || INT_TYPES.has(messageType)) && isNumber(data)) {
    return { data: INT_TYPES.has(messageType) ? Math.trunc(data) : data };
  }
  if (messageType && NUMBER_ARRAY_TYPES.has(messageType) && Array.isArray(data) && data.every(isNumber)) {
    return { data: messageType.includes("Int") ? data.map(Math.trunc) : [...data] };
  }
  return record;
}

/** The ROS CLI's flow form Bloom saves payloads in: `{data: [1.1]}`, `{data: 'teleop'}`, or JSON. */
export function parsePayloadText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /^\{\s*data\s*:\s*(.*?)\s*\}$/s.exec(trimmed);
    if (!match) {
      return undefined;
    }
    const value = parseFlowValue(match[1] ?? "");
    return value === undefined ? undefined : { data: value };
  }
}

function parseFlowValue(text: string): unknown {
  const value = text.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    const items = inner.split(",").map(parseFlowScalar);
    return items.some((item) => item === undefined) ? undefined : items;
  }
  return parseFlowScalar(value);
}

function parseFlowScalar(text: string): unknown {
  const value = text.trim();
  const quoted = /^'(.*)'$|^"(.*)"$/s.exec(value);
  if (quoted) {
    return quoted[1] ?? quoted[2] ?? "";
  }
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }
  if (/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value)) {
    return Number(value);
  }
  return value && !/[[\]{},]/.test(value) ? value : undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isModeRequestTopic(topic: string): boolean {
  return topic.endsWith("mode_request");
}

export function managerKey(state: "behaviour" | "shaping" | "target", topic = MODE_REQUEST_TOPIC): string {
  return topic === MODE_REQUEST_TOPIC ? `manager:${state}` : `manager:${state}@${topic}`;
}

export function parameterKey(node: string, name: string): string {
  return `param:${node}:${name}`;
}

/** One key and the value a control expects there. */
export type CommandStateCondition = { key: string; value: unknown };

/**
 * What a control reads and writes in the store. `writes` are what a press asks for; `lit` decides whether a
 * latched control shows selected (absent for a one-shot, which is never lit).
 */
export type CommandStateBinding = {
  lit?: readonly CommandStateCondition[];
  writes: readonly CommandStateCondition[];
};

/** A mode request as the manager's states model it: shaping, behaviour, and a target. */
export function modeCommandBinding(topic: string, raw: string): CommandStateBinding | null {
  const parsed = parseModeRequest(raw);
  if (!parsed.ok) {
    return null;
  }
  const mode = parsed.normalized;
  if (mode.startsWith("geometric/")) {
    const writes = [{ key: managerKey("shaping", topic), value: mode }];
    return { lit: writes, writes };
  }
  if (mode === "behaviour/passthrough") {
    const writes = [{ key: managerKey("behaviour", topic), value: mode }];
    return { lit: writes, writes };
  }
  if (mode.startsWith("behaviour/pose_target/")) {
    const writes = [
      { key: managerKey("behaviour", topic), value: "behaviour/pose_target" },
      { key: managerKey("target", topic), value: mode },
    ];
    return { lit: writes, writes };
  }
  // A joint target is dispatched once: the manager is back in passthrough on its next cycle.
  return { writes: [{ key: managerKey("target", topic), value: mode }] };
}

export type ToggleBinding = {
  /** Every key this toggle reads, each with its on and off value. */
  keys: readonly { key: string; off: unknown; on: unknown }[];
};

/** What a topic toggle's payloads write, for a digital output per pin and for a mode request per family. */
export function topicToggleBinding(
  topic: string,
  messageType: string | undefined,
  onPayload: unknown,
  offPayload: unknown,
): ToggleBinding | null {
  const on = normalizeCommandPayload(topic, messageType, onPayload);
  const off = normalizeCommandPayload(topic, messageType, offPayload);
  if (on === undefined || off === undefined) {
    return null;
  }
  if (topic === DIGITAL_OUTPUT_TOPIC) {
    const onPins = digitalPins(on);
    const offPins = digitalPins(off);
    if (!onPins || !offPins || onPins.length !== offPins.length) {
      return null;
    }
    const keys = onPins.map(([pin, value], index) =>
      offPins[index]?.[0] === pin
        ? { key: `${DIGITAL_OUTPUT_TOPIC}:${pin}`, off: offPins[index]?.[1], on: value }
        : null,
    );
    return keys.every((key) => key !== null) ? { keys: keys as ToggleBinding["keys"] } : null;
  }
  if (isModeRequestTopic(topic)) {
    const onMode = readData(on);
    const offMode = readData(off);
    const onBinding = typeof onMode === "string" ? modeCommandBinding(topic, onMode) : null;
    const offBinding = typeof offMode === "string" ? modeCommandBinding(topic, offMode) : null;
    const onLit = onBinding?.lit?.[0];
    const offLit = offBinding?.lit?.[0];
    if (!onLit || !offLit || onLit.key !== offLit.key) {
      return null;
    }
    return { keys: [{ key: onLit.key, off: offLit.value, on: onLit.value }] };
  }
  return { keys: [{ key: topic, off, on }] };
}

export function parameterToggleBinding(node: string, name: string): ToggleBinding {
  return { keys: [{ key: parameterKey(node, name), off: false, on: true }] };
}

function digitalPins(value: unknown): [number, boolean][] | null {
  const data = readData(value);
  if (!Array.isArray(data) || data.length === 0 || data.length % 2 !== 0 || !data.every(isNumber)) {
    return null;
  }
  const pins: [number, boolean][] = [];
  for (let index = 0; index < data.length; index += 2) {
    pins.push([Math.trunc(data[index] as number), Boolean(data[index + 1])]);
  }
  return pins;
}

function readData(value: unknown): unknown {
  return isRecord(value) ? value.data : undefined;
}

export type ToggleStateView = { source: CommandStateEntry["source"] | null; state: "off" | "on" | "other" | "unknown" };

/** On or off only when every key holds that side's value; unknown when any key is not known. */
export function readToggleState(
  binding: ToggleBinding | null,
  entryOf: (key: string) => CommandStateEntry | null,
): ToggleStateView {
  if (!binding || binding.keys.length === 0) {
    return { source: null, state: "unknown" };
  }
  const entries = binding.keys.map(({ key }) => entryOf(key));
  if (entries.some((entry) => knownValue(entry) === null)) {
    return { source: null, state: "unknown" };
  }
  const source = weakestSource(entries as CommandStateEntry[]);
  if (binding.keys.every(({ key, on }) => sameValue(entryOf(key)?.value, on))) {
    return { source, state: "on" };
  }
  if (binding.keys.every(({ key, off }) => sameValue(entryOf(key)?.value, off))) {
    return { source, state: "off" };
  }
  return { source, state: "other" };
}

export type SelectionView = {
  source: CommandStateEntry["source"] | null;
  state: "selected" | "unknown" | "unselected";
};

/** A latched control is selected when every condition holds; one-shots are never selected. */
export function readSelection(
  binding: CommandStateBinding | null | undefined,
  entryOf: (key: string) => CommandStateEntry | null,
): SelectionView | null {
  if (!binding?.lit || binding.lit.length === 0) {
    return null;
  }
  const entries = binding.lit.map(({ key }) => entryOf(key));
  if (entries.some((entry) => knownValue(entry) === null)) {
    return { source: null, state: "unknown" };
  }
  const selected = binding.lit.every(({ key, value }) => sameValue(entryOf(key)?.value, value));
  return { source: weakestSource(entries as CommandStateEntry[]), state: selected ? "selected" : "unselected" };
}

function weakestSource(entries: readonly CommandStateEntry[]): CommandStateEntry["source"] {
  return entries.every((entry) => entry.source === "measured") ? "measured" : (entries[0]?.source ?? "unknown");
}

// Presses: a press only sends; what it shows comes from the store, or "sending" for a short while.

export type PressOutcome = "accepted" | "lost" | "pending" | "refused";

export type PressRecord = {
  at: number;
  detail?: string;
  outcome: PressOutcome;
  /** The store's revision when the press went out; only a newer write can answer it. */
  revision: number;
  /** The store's revision when a refusal or a lost reply came back; a newer write ends its mark. */
  settledRevision?: number;
  writes: readonly CommandStateCondition[];
};

export type PressPhase = "idle" | "not-confirmed" | "refused" | "sending";

export function pressPhase(
  press: PressRecord | null,
  now: number,
  entryOf: (key: string) => CommandStateEntry | null,
  self: string,
): PressPhase {
  if (!press) {
    return "idle";
  }
  if (
    (press.outcome === "refused" || press.outcome === "lost") &&
    press.writes.some(({ key }) => (entryOf(key)?.revision ?? -1) > (press.settledRevision ?? Number.POSITIVE_INFINITY))
  ) {
    return "idle";
  }
  if (press.outcome === "refused") {
    return "refused";
  }
  const newer = press.writes.map(({ key, value }) => {
    const entry = entryOf(key);
    return entry && entry.revision > press.revision ? { entry, value } : null;
  });
  const ownWrite = newer.some((item) => item !== null && self !== "" && item.entry.by === self);
  if (press.outcome === "lost") {
    return ownWrite ? "idle" : "not-confirmed";
  }
  const answered = ownWrite || newer.some((item) => item !== null && sameValue(item.entry.value, item.value));
  return !answered && now - press.at < PRESS_SENDING_MS ? "sending" : "idle";
}

export function outcomeOf(outcome: WidgetActionOutcome | undefined): { detail?: string; outcome: PressOutcome } {
  if (outcome === undefined) {
    return { outcome: "accepted" };
  }
  const status = outcome.status ?? (outcome.accepted ? "accepted" : "refused");
  const detail = outcome.detail ? { detail: outcome.detail } : {};
  if (status === "accepted" || status === "superseded") {
    return { outcome: "accepted", ...detail };
  }
  return { outcome: status === "unknown" ? "lost" : "refused", ...detail };
}

export type CommandPress = {
  detail?: string;
  phase: PressPhase;
  /** Sends once; the reply only says whether it was refused or lost, never what the robot holds. */
  press: (
    writes: readonly CommandStateCondition[],
    send: () => WidgetActionOutcome | undefined | Promise<WidgetActionOutcome | undefined>,
  ) => void;
  /** What the pending press asked for while it is sending. */
  asked: readonly CommandStateCondition[] | null;
};

/** A control's own press and how it shows: sending until the store answers or 3 s pass. */
export function useCommandPress(): CommandPress {
  const store = useCommandStateStore();
  const [press, setPress] = useState<PressRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pressRef = useRef<PressRecord | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!press || press.outcome === "refused" || press.outcome === "lost") {
      return;
    }
    const remaining = press.at + PRESS_SENDING_MS - Date.now();
    if (remaining <= 0) {
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [press]);
  const pressFn = useCallback<CommandPress["press"]>((writes, send) => {
    const record: PressRecord = { at: Date.now(), outcome: "pending", revision: getCommandStateRevision(), writes };
    pressRef.current = record;
    setPress(record);
    setNow(record.at);
    const settle = (result: { detail?: string; outcome: PressOutcome }) => {
      if (!mountedRef.current || pressRef.current !== record) {
        return;
      }
      const next = { ...record, ...result, settledRevision: getCommandStateRevision() };
      pressRef.current = next;
      setPress(next);
      setNow(Date.now());
    };
    let outcome: ReturnType<typeof send>;
    try {
      outcome = send();
    } catch (error: unknown) {
      settle({ outcome: "lost", ...(error instanceof Error ? { detail: error.message } : {}) });
      return;
    }
    if (outcome instanceof Promise) {
      outcome.then(
        (result) => settle(outcomeOf(result)),
        (error: unknown) => settle({ outcome: "lost", ...(error instanceof Error ? { detail: error.message } : {}) }),
      );
    } else {
      settle(outcomeOf(outcome));
    }
  }, []);
  const entryOf = (key: string) => store.snapshot[key] ?? null;
  const phase = pressPhase(press, Math.max(now, Date.now()), entryOf, store.self);
  return {
    asked: phase === "sending" ? (press?.writes ?? null) : null,
    ...(phase === "refused" || phase === "not-confirmed" ? (press?.detail ? { detail: press.detail } : {}) : {}),
    phase,
    press: pressFn,
  };
}

/** Clears the store; tests only. */
export function resetCommandStateForTests(): void {
  state = EMPTY;
  notify();
}
