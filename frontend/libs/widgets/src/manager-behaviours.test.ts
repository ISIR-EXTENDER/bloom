import { describe, expect, it } from "vitest";
import {
  behaviourAvailability,
  behaviourOfModeRequest,
  readConfidences,
  sameConfidences,
  widgetBehaviour,
} from "./manager-behaviours";
import { TOGGLE_PURPOSES, togglePurposeOf } from "./toggle-purposes";

describe("the manager's lasting behaviours", () => {
  it("reads a behaviour from a mode request, normalised as the manager normalises it", () => {
    expect(behaviourOfModeRequest("Behaviour/Intent-Scaling")).toBe("intent_scaling");
    expect(behaviourOfModeRequest("behaviour/shared_control/reset")).toBe("shared_control");
    expect(behaviourOfModeRequest("behaviour/passthrough")).toBeNull();
    expect(behaviourOfModeRequest("geometric/jaco")).toBeNull();
  });

  it("knows which widgets depend on one", () => {
    const mode = { topic: "/mode_request", messageType: "std_msgs/msg/String" };
    expect(
      widgetBehaviour({ kind: "toggle", settings: { ...mode, onPayload: "{data: 'behaviour/shared_control'}" } }),
    ).toBe("shared_control");
    expect(widgetBehaviour({ kind: "toggle", settings: { topic: "/gripper_controller/commands" } })).toBeNull();
    expect(widgetBehaviour({ kind: "command-button", settings: {} }, "behaviour/intent_scaling")).toBe(
      "intent_scaling",
    );
    expect(
      widgetBehaviour({ kind: "command-button", settings: { ...mode, payload: { data: "behaviour/intent_scaling" } } }),
    ).toBe("intent_scaling");
    expect(
      widgetBehaviour({
        kind: "slider",
        settings: {
          runtime_binding: { adapter: "parameter", value_mapping: { parameter: "behaviours.shared_control.gamma" } },
        },
      }),
    ).toBe("shared_control");
    expect(widgetBehaviour({ kind: "gauge", settings: { topic: "/cartesian_manager/intent_scale" } })).toBe(
      "intent_scaling",
    );
    expect(widgetBehaviour({ kind: "confidence-bars", settings: {} })).toBe("shared_control");
    expect(widgetBehaviour({ kind: "robot-3d", settings: { goalsTopic: "/shared_control/goals" } })).toBeNull();
    expect(widgetBehaviour({ kind: "gauge", settings: { topic: "/ee_pose" } })).toBeNull();
  });

  it("is available only once its marker parameter is known, and unknown before the store answers", () => {
    const known = new Set(["param:/cartesian_manager:behaviours.intent_scaling.min_scale"]);
    const isKnown = (key: string) => known.has(key);
    expect(behaviourAvailability("intent_scaling", true, isKnown)).toBe("available");
    expect(behaviourAvailability("shared_control", true, isKnown)).toBe("unavailable");
    expect(behaviourAvailability("shared_control", false, isKnown)).toBe("unknown");
  });

  it("reads a malformed confidences message without throwing, and never names two bars alike", () => {
    expect(readConfidences(undefined)).toEqual([]);
    expect(readConfidences({ data: "0.5" })).toEqual([]);
    expect(readConfidences({ layout: { dim: [{ label: "" }] }, data: [0.5, Number.NaN, 0.25] })).toEqual([
      { id: "goal_0", value: 0.5 },
      { id: "goal_2", value: 0.25 },
    ]);
    // A label shorter than the data, and one that repeats an id: the index and a number keep every bar distinct.
    expect(readConfidences({ layout: { dim: [{ label: "agnostic, goal_0 ,goal_0" }] }, data: [1, 0, 0, 0] })).toEqual([
      { id: "agnostic", value: 1 },
      { id: "goal_0", value: 0 },
      { id: "goal_0 #2", value: 0 },
      { id: "goal_3", value: 0 },
    ]);
    expect(readConfidences({ data: Array.from({ length: 25 }, () => 0.04) })).toHaveLength(25);
  });

  it("calls two readings the same only when every value rounds to the same hundredth", () => {
    const a = [{ id: "agnostic", value: 0.994 }];
    expect(sameConfidences(a, [{ id: "agnostic", value: 0.996 }])).toBe(false);
    expect(sameConfidences(a, [{ id: "agnostic", value: 0.991 }])).toBe(true);
  });

  it("names the confidence bars from the dimension label, agnostic first", () => {
    const goals = readConfidences({
      layout: { dim: [{ label: "agnostic,goal_0,goal_1", size: 3, stride: 3 }] },
      data: [0.2, 0.7, 1.4],
    });
    expect(goals).toEqual([
      { id: "agnostic", value: 0.2 },
      { id: "goal_0", value: 0.7 },
      { id: "goal_1", value: 1 },
    ]);
    expect(readConfidences({ data: [0.5] })).toEqual([{ id: "goal_0", value: 0.5 }]);
    expect(readConfidences({ data: ["x"] })).toEqual([]);
    expect(sameConfidences(goals, [...goals])).toBe(true);
    expect(sameConfidences(goals, goals.slice(1))).toBe(false);
  });
});

describe("toggle purposes", () => {
  it("write a mode toggle that is off on passthrough, and are recognised again", () => {
    for (const purpose of TOGGLE_PURPOSES) {
      expect(togglePurposeOf(purpose.settings())).toBe(purpose.id);
    }
    const assist = TOGGLE_PURPOSES.find((purpose) => purpose.id === "shared-control")?.settings() ?? {};
    expect(assist).toMatchObject({
      topic: "/mode_request",
      onPayload: "{data: 'behaviour/shared_control'}",
      offPayload: "{data: 'behaviour/passthrough'}",
    });
    expect(togglePurposeOf({ topic: "/mode_request", onPayload: "{data: 'geometric/jaco'}" })).toBeNull();
  });
});
