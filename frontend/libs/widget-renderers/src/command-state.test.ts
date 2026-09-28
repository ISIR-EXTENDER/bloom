import type { CommandStateEntry } from "@bloom/api-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCommandStateMessage,
  clearCommandState,
  getCommandStateEntry,
  getCommandStateRevision,
  modeCommandBinding,
  normalizeCommandPayload,
  outcomeOf,
  ownWriteSince,
  type PressRecord,
  parameterToggleBinding,
  pressPhase,
  readSelection,
  readToggleState,
  resetCommandStateForTests,
  subscribeCommandState,
  topicToggleBinding,
} from "./command-state";

afterEach(() => resetCommandStateForTests());

const entry = (value: unknown, revision: number, by = "robot", source = "commanded"): CommandStateEntry => ({
  value,
  source: source as CommandStateEntry["source"],
  updated_at: "",
  by,
  revision,
});

const message = (revision: number, snapshot: Record<string, CommandStateEntry>, self = "me") => ({
  type: "command_state" as const,
  revision,
  self,
  snapshot,
});

describe("the frontend command-state store", () => {
  it("replaces the snapshot wholesale and drops an older revision", () => {
    applyCommandStateMessage(message(5, { a: entry(1, 4), b: entry(2, 5) }));
    applyCommandStateMessage(message(6, { a: entry(3, 6) }));
    expect(getCommandStateEntry("a")?.value).toBe(3);
    expect(getCommandStateEntry("b")).toBeNull();

    applyCommandStateMessage(message(4, { a: entry(9, 4) }));
    expect(getCommandStateEntry("a")?.value).toBe(3);
    expect(getCommandStateRevision()).toBe(6);
  });

  it("keeps an unchanged entry's identity across a periodic push", () => {
    applyCommandStateMessage(message(2, { a: entry({ data: [1, 2] }, 2) }));
    const held = getCommandStateEntry("a");
    applyCommandStateMessage(message(2, { a: entry({ data: [1, 2] }, 2) }));
    expect(getCommandStateEntry("a")).toBe(held);
  });

  it("knows nothing after a clear, and takes any revision after it", () => {
    let notified = 0;
    const unsubscribe = subscribeCommandState(() => {
      notified += 1;
    });
    applyCommandStateMessage(message(9, { a: entry(true, 9) }));
    clearCommandState();
    expect(getCommandStateEntry("a")).toBeNull();

    applyCommandStateMessage(message(1, { a: entry(false, 1) }));
    expect(getCommandStateEntry("a")?.value).toBe(false);
    expect(notified).toBe(3);
    unsubscribe();
  });
});

describe("payload normalisation, as the backend's", () => {
  it.each([
    ["/ui/lamp", "std_msgs/msg/Bool", "{data: true}", { data: true }],
    ["/gripper", "std_msgs/msg/Float64MultiArray", "{data: [0.8]}", { data: [0.8] }],
    ["/gripper", "std_msgs/msg/Float64MultiArray", { data: [1] }, { data: [1] }],
    ["/limit", "std_msgs/msg/Float64", { data: 1 }, { data: 1 }],
    ["/count", "std_msgs/msg/Int32", "{data: 3}", { data: 3 }],
    ["/sm", "std_msgs/msg/String", "{data: 'teleop'}", { data: "teleop" }],
    ["/mode_request", "std_msgs/msg/String", '{"data": "Geometric/Jaco"}', { data: "geometric/jaco" }],
    [
      "/arm2/mode_request",
      "std_msgs/msg/String",
      "{data: 'Behaviour/Joint-Target/Home'}",
      {
        data: "behaviour/joint_target/home",
      },
    ],
    ["/raw", undefined, 5, { data: 5 }],
  ])("reads %s %s %j", (topic, type, payload, expected) => {
    expect(normalizeCommandPayload(topic, type, payload)).toEqual(expected);
  });

  it("gives up on text it cannot read", () => {
    expect(normalizeCommandPayload("/x", "std_msgs/msg/String", "{data: [a, {b}]}")).toBeUndefined();
    expect(normalizeCommandPayload("/x", "std_msgs/msg/String", "")).toBeUndefined();
  });
});

describe("bindings", () => {
  it("models the manager's shaping, behaviour and targets", () => {
    expect(modeCommandBinding("/mode_request", "Geometric/Snake")?.lit).toEqual([
      { key: "manager:shaping", value: "geometric/snake" },
    ]);
    expect(modeCommandBinding("/mode_request", "behaviour/joint_target/home")).toEqual({
      writes: [{ key: "manager:target", value: "behaviour/joint_target/home" }],
    });
    expect(modeCommandBinding("/mode_request", "not a mode")).toBeNull();
  });

  it("reads a digital output per pin and a mode toggle per family", () => {
    expect(
      topicToggleBinding("/hub/digital_output", "std_msgs/msg/Float32MultiArray", "{data: [3, 1]}", {
        data: [3, 0],
      }),
    ).toEqual({ keys: [{ key: "/hub/digital_output:3", off: false, on: true }] });
    expect(
      topicToggleBinding("/mode_request", "std_msgs/msg/String", "{data: 'geometric/snake'}", {
        data: "geometric/both",
      }),
    ).toEqual({ keys: [{ key: "manager:shaping", off: "geometric/both", on: "geometric/snake" }] });
    expect(
      topicToggleBinding("/mode_request", "std_msgs/msg/String", "{data: 'geometric/snake'}", {
        data: "behaviour/passthrough",
      }),
    ).toBeNull();
  });

  it("lights on, off, other, or neither when not known", () => {
    const binding = parameterToggleBinding("/cartesian_manager", "inputs.joystick.enabled");
    const key = "param:/cartesian_manager:inputs.joystick.enabled";
    const of = (value: CommandStateEntry | null) => (k: string) => (k === key ? value : null);
    expect(readToggleState(binding, of(entry(true, 1, "robot", "measured")))).toEqual({
      source: "measured",
      state: "on",
    });
    expect(readToggleState(binding, of(entry(false, 1))).state).toBe("off");
    expect(readToggleState(binding, of(entry(3, 1))).state).toBe("other");
    expect(readToggleState(binding, of(entry(null, 1, "server", "unknown"))).state).toBe("unknown");
    expect(readToggleState(binding, of(null)).state).toBe("unknown");
  });

  it("selects a pose target only while the manager is in it", () => {
    const binding = modeCommandBinding("/mode_request", "behaviour/pose_target/ready");
    const held: Record<string, CommandStateEntry> = {
      "manager:behaviour": entry("behaviour/pose_target", 1),
      "manager:target": entry("behaviour/pose_target/ready", 1),
    };
    expect(readSelection(binding, (key) => held[key] ?? null)?.state).toBe("selected");
    held["manager:behaviour"] = entry("behaviour/passthrough", 2, "robot", "measured");
    expect(readSelection(binding, (key) => held[key] ?? null)?.state).toBe("unselected");
    expect(readSelection(modeCommandBinding("/mode_request", "behaviour/joint_target/home"), () => null)).toBeNull();
  });
});

describe("a press's phase", () => {
  const writes = [{ key: "k", value: { data: true } }];
  const press = (outcome: PressRecord["outcome"], extra: Partial<PressRecord> = {}): PressRecord => ({
    at: 0,
    id: 1,
    outcome,
    revision: 10,
    writes,
    ...extra,
  });

  it("is sending until the store has a newer write from this screen, or the value, or 3 s pass", () => {
    const at = (value: CommandStateEntry | null) => () => value;
    expect(pressPhase(press("pending"), 100, at(entry({ data: false }, 9)), "me")).toBe("sending");
    expect(pressPhase(press("accepted"), 100, at(entry({ data: false }, 11, "me")), "me")).toBe("idle");
    expect(pressPhase(press("pending"), 100, at(entry({ data: true }, 11, "other")), "me")).toBe("idle");
    expect(pressPhase(press("pending"), 100, at(entry({ data: true }, 10, "me")), "me")).toBe("sending");
    expect(pressPhase(press("pending"), 3000, at(null), "me")).toBe("idle");
  });

  it("stays answered once its own write was seen, whatever the server writes next", () => {
    // Assist on, then STOP within 3 s: the server's reset replaces the own write, and the press must not read
    // as sending again on the stopped screen.
    const seen = press("accepted", { answered: true });
    expect(pressPhase(seen, 100, () => entry({ data: false }, 12, "server", "reset"), "me")).toBe("idle");
    expect(pressPhase(press("accepted"), 100, () => entry({ data: false }, 12, "server", "reset"), "me")).toBe(
      "sending",
    );
    expect(ownWriteSince(press("accepted"), () => entry({ data: true }, 11, "me"), "me")).toBe(true);
    expect(ownWriteSince(press("accepted"), () => entry({ data: true }, 11, "other"), "me")).toBe(false);
  });

  it("shows a refusal until someone writes the key again", () => {
    const refused = press("refused", { settledRevision: 12 });
    expect(pressPhase(refused, 100, () => entry({ data: false }, 12), "me")).toBe("refused");
    expect(pressPhase(refused, 100, () => entry({ data: true }, 13, "other"), "me")).toBe("idle");
  });

  it("marks a lost reply not confirmed only while the store has no newer write from this screen", () => {
    const lost = press("lost", { settledRevision: 11 });
    expect(pressPhase(lost, 100, () => entry({ data: false }, 9), "me")).toBe("not-confirmed");
    expect(pressPhase(lost, 100, () => entry({ data: true }, 11, "me"), "me")).toBe("idle");
    expect(pressPhase(lost, 100, () => entry({ data: true }, 11, "other"), "me")).toBe("not-confirmed");
    expect(pressPhase(lost, 100, () => entry({ data: true }, 12, "other"), "me")).toBe("idle");
  });

  it("reads a reply as accepted, refused or lost", () => {
    expect(outcomeOf(undefined).outcome).toBe("accepted");
    expect(outcomeOf({ accepted: false, status: "superseded" }).outcome).toBe("accepted");
    expect(outcomeOf({ accepted: false, detail: "Stopped." })).toEqual({ detail: "Stopped.", outcome: "refused" });
    expect(outcomeOf({ accepted: false, status: "transient" }).outcome).toBe("refused");
    expect(outcomeOf({ accepted: false, status: "unknown" }).outcome).toBe("lost");
  });
});

describe("the lasting behaviours in the store", () => {
  it("light on the behaviour key, replace each other, and the reset writes without lighting", () => {
    const intent = modeCommandBinding("/mode_request", "Behaviour/Intent-Scaling");
    expect(intent).toEqual({
      lit: [{ key: "manager:behaviour", value: "behaviour/intent_scaling" }],
      writes: [{ key: "manager:behaviour", value: "behaviour/intent_scaling" }],
    });
    const assist = modeCommandBinding("/mode_request", "behaviour/shared_control");
    expect(assist?.lit).toEqual([{ key: "manager:behaviour", value: "behaviour/shared_control" }]);
    expect(modeCommandBinding("/mode_request", "behaviour/shared_control/reset")).toEqual({
      writes: [{ key: "manager:behaviour", value: "behaviour/shared_control" }],
    });

    const entries = { "manager:behaviour": entry("behaviour/shared_control", 3, "robot", "measured") };
    const entryOf = (key: string) => entries[key as keyof typeof entries] ?? null;
    expect(readSelection(assist, entryOf)).toEqual({ source: "measured", state: "selected" });
    expect(readSelection(intent, entryOf)).toEqual({ source: "measured", state: "unselected" });
  });

  it("gives a toggle between a behaviour and passthrough one key, off on the other behaviour", () => {
    const binding = topicToggleBinding(
      "/mode_request",
      "std_msgs/msg/String",
      "{data: 'behaviour/intent_scaling'}",
      "{data: 'behaviour/passthrough'}",
    );
    expect(binding).toEqual({
      keys: [
        { key: "manager:behaviour", off: "behaviour/passthrough", on: "behaviour/intent_scaling", otherIsOff: true },
      ],
    });
    const held = (value: string) => (key: string) => (key === "manager:behaviour" ? entry(value, 1) : null);
    expect(readToggleState(binding, held("behaviour/intent_scaling")).state).toBe("on");
    expect(readToggleState(binding, held("behaviour/passthrough")).state).toBe("off");
    expect(readToggleState(binding, held("behaviour/shared_control")).state).toBe("off");
    // A shaping toggle keeps saying "other" under a third mode.
    const jaco = topicToggleBinding(
      "/mode_request",
      "std_msgs/msg/String",
      "{data: 'geometric/jaco'}",
      "{data: 'geometric/both'}",
    );
    const shaping = (key: string) => (key === "manager:shaping" ? entry("geometric/snake", 1) : null);
    expect(readToggleState(jaco, shaping).state).toBe("other");
  });
});
