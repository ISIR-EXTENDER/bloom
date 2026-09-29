import { describe, expect, it } from "vitest";
import { normalizeWidgetSettings } from "./settings";
import { SLIDER_PURPOSE_KEYS, SLIDER_PURPOSES, sliderPurposeOf } from "./slider-purposes";

describe("what a slider can be", () => {
  it("ships settings the slider contract accepts, for either arm", () => {
    for (const purpose of SLIDER_PURPOSES) {
      for (const robot of [undefined, "explorer", "kinova"]) {
        const result = normalizeWidgetSettings("slider", purpose.settings(robot));
        expect(result.success, `${purpose.id} on ${robot ?? "the default arm"}: ${JSON.stringify(result)}`).toBe(true);
      }
    }
  });

  it("is recognised again from the settings it wrote, so the Builder shows the purpose it applied", () => {
    for (const purpose of SLIDER_PURPOSES) {
      expect(sliderPurposeOf(purpose.settings())).toBe(purpose.id);
    }
  });

  it("owns every key any purpose writes, so switching leaves nothing of the previous one behind", () => {
    for (const purpose of SLIDER_PURPOSES) {
      for (const key of Object.keys(purpose.settings("kinova"))) {
        expect(SLIDER_PURPOSE_KEYS, `${purpose.id} writes ${key}`).toContain(key);
      }
    }
  });

  it("drives the manager: height and pivot are teleop axes, the gain is a manager parameter", () => {
    const byId = Object.fromEntries(SLIDER_PURPOSES.map((purpose) => [purpose.id, purpose.settings()]));
    expect(byId.height?.runtime_binding).toMatchObject({
      adapter: "teleop",
      axis_mapping: { value: { component: "linear_z" } },
      value_mapping: { target_topic: "/joystick_cartesian_command" },
    });
    // Pivot turns the other way round on the stick than on the arm.
    expect(byId.pivot?.runtime_binding).toMatchObject({
      axis_mapping: { value: { component: "angular_z", scale: -1 } },
    });
    expect(byId["snake-gain"]?.runtime_binding).toEqual({
      adapter: "parameter",
      target: "parameter",
      value_mapping: { node: "/cartesian_manager", parameter: "shapers.snake.gain" },
    });
    expect(byId["angular-speed"]?.topic).toBe("/explorer_user_interfaces/rqt_armcontrol/max_angular_speed");
  });

  it("reads no purpose into a slider bound elsewhere", () => {
    expect(sliderPurposeOf({})).toBeNull();
    expect(sliderPurposeOf({ topic: "/gripper/opening" })).toBeNull();
    expect(
      sliderPurposeOf({ runtime_binding: { adapter: "teleop", axis_mapping: { value: { component: "linear_x" } } } }),
    ).toBeNull();
    expect(
      sliderPurposeOf({
        runtime_binding: { adapter: "parameter", value_mapping: { node: "/cartesian_manager", parameter: "other" } },
      }),
    ).toBeNull();
    expect(sliderPurposeOf({ runtime_binding: { adapter: "topic" } })).toBeNull();
  });
});
