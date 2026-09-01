import { describe, expect, it } from "vitest";

import {
  composeTwist,
  contributionFromAxisMap,
  createZeroTwist,
  defaultJoystickAxisMap,
  readWidgetAxisMap,
  TeleopTwistComposer,
  TWIST_COMPONENTS,
} from "./teleop-composition";

describe("twist components", () => {
  it("names the six components the way cartesian_manager does", () => {
    expect([...TWIST_COMPONENTS]).toEqual(["linear_x", "linear_y", "linear_z", "angular_x", "angular_y", "angular_z"]);
  });
});

describe("readWidgetAxisMap", () => {
  it("reads an explicit mapping", () => {
    const axisMap = readWidgetAxisMap({
      adapter: "teleop",
      axis_mapping: { x: "linear_x", y: { component: "linear_y", scale: 0.5 } },
    });

    expect(axisMap).toEqual({ x: { component: "linear_x" }, y: { component: "linear_y", scale: 0.5 } });
  });

  it("reads a single-output mapping for a slider", () => {
    expect(readWidgetAxisMap({ axis_mapping: { value: "linear_z" } })).toEqual({
      value: { component: "linear_z" },
    });
  });

  it("returns undefined when no mapping is declared, so legacy behaviour applies", () => {
    expect(readWidgetAxisMap({ adapter: "teleop", target: "translation" })).toBeUndefined();
    expect(readWidgetAxisMap(undefined)).toBeUndefined();
  });

  it("ignores component names cartesian_manager would not accept", () => {
    expect(readWidgetAxisMap({ axis_mapping: { value: "linear_w" } })).toBeUndefined();
    expect(readWidgetAxisMap({ axis_mapping: { x: { component: "nonsense" } } })).toBeUndefined();
  });
});

describe("defaultJoystickAxisMap", () => {
  it("keeps the existing translation behaviour", () => {
    expect(defaultJoystickAxisMap(false)).toEqual({
      x: { component: "linear_x" },
      y: { component: "linear_y" },
    });
  });

  it("keeps the existing rotation behaviour", () => {
    expect(defaultJoystickAxisMap(true)).toEqual({
      x: { component: "angular_x" },
      y: { component: "angular_y" },
    });
  });
});

describe("contributionFromAxisMap", () => {
  it("maps a joystick vector onto two components", () => {
    const contribution = contributionFromAxisMap(defaultJoystickAxisMap(false), { x: 0.4, y: -0.2 });

    expect(contribution).toEqual({ linear_x: 0.4, linear_y: -0.2 });
  });

  it("maps a slider value onto one component", () => {
    const contribution = contributionFromAxisMap({ value: { component: "linear_z" } }, { value: 0.3 });

    expect(contribution).toEqual({ linear_z: 0.3 });
  });

  it("applies the configured scale, like joystick_mapper's AxisBinding", () => {
    const contribution = contributionFromAxisMap({ value: { component: "angular_z", scale: -2 } }, { value: 0.25 });

    expect(contribution).toEqual({ angular_z: -0.5 });
  });

  it("ignores outputs the widget does not map", () => {
    const contribution = contributionFromAxisMap({ x: { component: "linear_x" } }, { x: 0.5, y: 0.9 });

    expect(contribution).toEqual({ linear_x: 0.5 });
  });

  it("accumulates when one widget drives a component twice", () => {
    const contribution = contributionFromAxisMap(
      { x: { component: "linear_z" }, y: { component: "linear_z" } },
      { x: 0.2, y: 0.3 },
    );

    expect(contribution).toEqual({ linear_z: 0.5 });
  });
});

describe("composeTwist", () => {
  it("returns a zero twist for no contributions", () => {
    expect(composeTwist([])).toEqual(createZeroTwist());
  });

  it("fills all six components from several widgets", () => {
    const twist = composeTwist([
      { linear_x: 0.4, linear_y: -0.2 },
      { linear_z: 0.1 },
      { angular_x: 0.5, angular_y: -0.5 },
      { angular_z: 0.25 },
    ]);

    expect(twist).toEqual({
      linear: { x: 0.4, y: -0.2, z: 0.1 },
      angular: { x: 0.5, y: -0.5, z: 0.25 },
    });
  });

  it("sums widgets that drive the same component", () => {
    const twist = composeTwist([{ linear_x: 0.3 }, { linear_x: 0.2 }]);

    expect(twist.linear.x).toBeCloseTo(0.5);
  });
});

describe("TeleopTwistComposer", () => {
  it("keeps other widgets' values when one widget updates", () => {
    // The regression this whole module exists to prevent: a Z slider must not
    // erase the translation joystick.
    const composer = new TeleopTwistComposer();
    composer.contribute("translation", { linear_x: 0.4, linear_y: -0.2 });
    composer.contribute("z-slider", { linear_z: 0.15 });

    expect(composer.compose()).toEqual({
      linear: { x: 0.4, y: -0.2, z: 0.15 },
      angular: { x: 0, y: 0, z: 0 },
    });

    composer.contribute("z-slider", { linear_z: -0.05 });

    expect(composer.compose().linear).toEqual({ x: 0.4, y: -0.2, z: -0.05 });
  });

  it("drops a widget's contribution on release", () => {
    const composer = new TeleopTwistComposer();
    composer.contribute("translation", { linear_x: 0.4 });
    composer.contribute("rotation", { angular_z: 0.9 });

    composer.release("rotation");

    expect(composer.compose()).toEqual({
      linear: { x: 0.4, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
    expect(composer.activeWidgetIds).toEqual(["translation"]);
  });

  it("composes a full 6-DoF twist from four widgets", () => {
    const composer = new TeleopTwistComposer();
    composer.contribute("translation", contributionFromAxisMap(defaultJoystickAxisMap(false), { x: 0.1, y: 0.2 }));
    composer.contribute("rotation", contributionFromAxisMap(defaultJoystickAxisMap(true), { x: 0.3, y: 0.4 }));
    composer.contribute("z", contributionFromAxisMap({ value: { component: "linear_z" } }, { value: 0.5 }));
    composer.contribute("rz", contributionFromAxisMap({ value: { component: "angular_z" } }, { value: 0.6 }));

    expect(composer.compose()).toEqual({
      linear: { x: 0.1, y: 0.2, z: 0.5 },
      angular: { x: 0.3, y: 0.4, z: 0.6 },
    });
  });

  it("clears everything, which is what zero-on-release needs", () => {
    const composer = new TeleopTwistComposer();
    composer.contribute("translation", { linear_x: 0.4 });

    composer.clear();

    expect(composer.compose()).toEqual(createZeroTwist());
    expect(composer.activeWidgetIds).toEqual([]);
  });
});
