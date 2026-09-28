// What a widget's behaviour reads as when its settings are missing or of the wrong shape.
import { describe, expect, it } from "vitest";
import { behaviourOfModeRequest, widgetBehaviour } from "./manager-behaviours";

describe("a behaviour read from an author's settings", () => {
  it("is none when the mode request is missing or not text", () => {
    expect(behaviourOfModeRequest(null)).toBeNull();
    expect(behaviourOfModeRequest(undefined)).toBeNull();
    expect(behaviourOfModeRequest("behaviour/passthrough")).toBeNull();
    expect(behaviourOfModeRequest(" Behaviour/Shared-Control/Reset ")).toBe("shared_control");
  });

  it("follows a slider's parameter only when it names a behaviour's tuning", () => {
    const slider = (parameter: unknown) => ({
      kind: "slider",
      settings: { runtime_binding: { adapter: "parameter", value_mapping: { node: "/cartesian_manager", parameter } } },
    });
    expect(widgetBehaviour(slider("behaviours.intent_scaling.min_scale"))).toBe("intent_scaling");
    expect(widgetBehaviour(slider("behaviours.shared_control.gamma"))).toBe("shared_control");
    expect(widgetBehaviour(slider("shapers.snake.gain"))).toBeNull();
    expect(widgetBehaviour(slider(7))).toBeNull();
    expect(widgetBehaviour({ kind: "slider", settings: { runtime_binding: { adapter: "topic" } } })).toBeNull();
  });

  it("takes the caller's resolved preset over a button's own payload", () => {
    const button = {
      kind: "command-button",
      settings: { topic: "/mode_request", payload: { data: "behaviour/intent_scaling" } },
    };
    expect(widgetBehaviour(button)).toBe("intent_scaling");
    expect(widgetBehaviour(button, "behaviour/shared_control")).toBe("shared_control");
    expect(widgetBehaviour({ ...button, settings: { topic: "/other", payload: { data: "x" } } })).toBeNull();
  });
});
