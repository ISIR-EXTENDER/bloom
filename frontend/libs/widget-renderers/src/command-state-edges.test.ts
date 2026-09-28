// The store's readers on the payloads authors actually save: CLI flow text, mistyped data, and pin lists.
import type { CommandStateEntry } from "@bloom/api-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCommandStateMessage,
  type CommandStateMessage,
  getCommandStateEntry,
  managerKey,
  normalizeCommandPayload,
  parameterKey,
  parsePayloadText,
  readSelection,
  readToggleState,
  resetCommandStateForTests,
  sameValue,
  topicToggleBinding,
} from "./command-state";

afterEach(() => resetCommandStateForTests());

const entry = (value: unknown, revision = 1): CommandStateEntry => ({
  value,
  source: "commanded",
  updated_at: "",
  by: "robot",
  revision,
});

describe("payload text in the ROS CLI's flow form", () => {
  it.each([
    ["{data: 'teleop'}", { data: "teleop" }],
    ['{data: "with space"}', { data: "with space" }],
    ["{data: TRUE}", { data: true }],
    ["{data: false}", { data: false }],
    ["{data: 3e2}", { data: 300 }],
    ["{data: -.5}", { data: -0.5 }],
    ["{data: []}", { data: [] }],
    ["{data: [1, a, 'b']}", { data: [1, "a", "b"] }],
    ["{data: ''}", { data: "" }],
  ])("reads %s", (text, expected) => {
    expect(parsePayloadText(text)).toEqual(expected);
  });

  it.each([["{data: [1, {b}]}"], ["{data: a,b}"], ["plain"], ["{other: 1}"], ["   "]])(
    "gives up on %s rather than guessing",
    (text) => {
      expect(parsePayloadText(text)).toBeUndefined();
    },
  );
});

describe("a payload as the backend stores it", () => {
  it("truncates integers as rosidl does and copies arrays", () => {
    expect(normalizeCommandPayload("/n", "std_msgs/msg/Int32", { data: 2.7 })).toEqual({ data: 2 });
    expect(normalizeCommandPayload("/n", "std_msgs/msg/UInt8MultiArray", { data: [1.9, -1.2] })).toEqual({
      data: [1, -1],
    });
    const floats = [0.5, 0.25];
    const copy = normalizeCommandPayload("/n", "std_msgs/msg/Float64MultiArray", { data: floats }) as {
      data: number[];
    };
    expect(copy.data).toEqual(floats);
    expect(copy.data).not.toBe(floats);
  });

  it("keeps a payload whose data is not what the type carries, so the toggle reads it as another value", () => {
    expect(normalizeCommandPayload("/n", "std_msgs/msg/Bool", { data: "true" })).toEqual({ data: "true" });
    expect(normalizeCommandPayload("/n", "std_msgs/msg/String", { data: 5, extra: 1 })).toEqual({ data: 5, extra: 1 });
    expect(normalizeCommandPayload("/n", "std_msgs/msg/Float64", { data: Number.NaN })).toEqual({ data: Number.NaN });
    expect(normalizeCommandPayload("/n", "std_msgs/msg/Int32MultiArray", { data: [1, "2"] })).toEqual({
      data: [1, "2"],
    });
    expect(normalizeCommandPayload("/mode_request", "std_msgs/msg/String", { data: 3 })).toEqual({ data: 3 });
  });

  it("wraps a bare value or list in data, as ros2 topic pub does", () => {
    expect(normalizeCommandPayload("/n", undefined, [1, 2])).toEqual({ data: [1, 2] });
    expect(normalizeCommandPayload("/n", "custom/msg/Thing", { a: 1 })).toEqual({ a: 1 });
  });
});

describe("a digital output toggle", () => {
  it("binds several pins at once, each to its own key", () => {
    expect(
      topicToggleBinding("/hub/digital_output", "std_msgs/msg/Float32MultiArray", "{data: [3, 1, 4, 1]}", {
        data: [3, 0, 4, 0],
      }),
    ).toEqual({
      keys: [
        { key: "/hub/digital_output:3", off: false, on: true },
        { key: "/hub/digital_output:4", off: false, on: true },
      ],
    });
  });

  it.each([
    ["pins in another order", { data: [3, 1, 4, 1] }, { data: [4, 0, 3, 0] }],
    ["a different number of pins", { data: [3, 1] }, { data: [3, 0, 4, 0] }],
    ["an odd list", { data: [3, 1, 4] }, { data: [3, 0, 4] }],
    ["a pin that is not a number", { data: ["a", 1] }, { data: ["a", 0] }],
    ["an empty list", { data: [] }, { data: [] }],
    ["text nothing can read", "{data: [3, {1}]}", { data: [3, 0] }],
  ])("has no binding with %s", (_case, on, off) => {
    expect(topicToggleBinding("/hub/digital_output", "std_msgs/msg/Float32MultiArray", on, off)).toBeNull();
  });
});

describe("a mode toggle", () => {
  it("has no binding when either side is not a mode, or the sides are of different families", () => {
    expect(
      topicToggleBinding("/mode_request", "std_msgs/msg/String", { data: "nonsense" }, { data: "geometric/both" }),
    ).toBeNull();
    expect(
      topicToggleBinding("/mode_request", "std_msgs/msg/String", { data: 1 }, { data: "geometric/both" }),
    ).toBeNull();
    expect(
      topicToggleBinding(
        "/mode_request",
        "std_msgs/msg/String",
        { data: "behaviour/joint_target/home" },
        { data: "behaviour/passthrough" },
      ),
    ).toBeNull();
  });

  it("is off under the other lasting behaviour and in another mode for a shaping toggle", () => {
    const behaviour = topicToggleBinding(
      "/mode_request",
      "std_msgs/msg/String",
      { data: "behaviour/intent_scaling" },
      { data: "behaviour/passthrough" },
    );
    const shaping = topicToggleBinding(
      "/mode_request",
      "std_msgs/msg/String",
      { data: "geometric/snake" },
      { data: "geometric/both" },
    );
    const held: Record<string, CommandStateEntry> = {
      "manager:behaviour": entry("behaviour/shared_control"),
      "manager:shaping": entry("geometric/jaco"),
    };
    const of = (key: string) => held[key] ?? null;
    expect(readToggleState(behaviour, of).state).toBe("off");
    expect(readToggleState(shaping, of).state).toBe("other");
  });
});

describe("readers with nothing to read", () => {
  it("are unknown or absent", () => {
    expect(readToggleState(null, () => null)).toEqual({ source: null, state: "unknown" });
    expect(readToggleState({ keys: [] }, () => null)).toEqual({ source: null, state: "unknown" });
    expect(readSelection(null, () => null)).toBeNull();
    expect(readSelection({ writes: [], lit: [] }, () => null)).toBeNull();
    expect(readSelection({ writes: [], lit: [{ key: "k", value: 1 }] }, () => null)).toEqual({
      source: null,
      state: "unknown",
    });
  });

  it("compare values structurally, and never call two shapes the same", () => {
    expect(sameValue({ data: [1, { a: 2 }] }, { data: [1, { a: 2 }] })).toBe(true);
    expect(sameValue({ data: [1, { a: 2 }] }, { data: [1, { a: 3 }] })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue([1, 2], [1])).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
    expect(sameValue(Number.NaN, Number.NaN)).toBe(false);
  });

  it("keys a second arm's manager states by its topic", () => {
    expect(managerKey("behaviour", "/arm2/mode_request")).toBe("manager:behaviour@/arm2/mode_request");
    expect(managerKey("target")).toBe("manager:target");
    expect(parameterKey("/cartesian_manager", "inputs.sources")).toBe("param:/cartesian_manager:inputs.sources");
  });

  it("take a snapshot-less message as an empty store", () => {
    applyCommandStateMessage({ type: "command_state", revision: 3 } as CommandStateMessage);
    expect(getCommandStateEntry("anything")).toBeNull();
  });
});
