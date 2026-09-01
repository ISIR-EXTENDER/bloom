import { describe, expect, it } from "vitest";

import { contributionFromAxisMap, readWidgetAxisMap } from "./teleop-composition";

/**
 * `joystick_mapper`'s local B1/B2 button swaps the entire AxisMap without
 * publishing a mode request, so one physical stick drives translation in B1 and
 * orientation in B2. A Bloom app should be able to do the same with one
 * joystick rather than needing two.
 */
const BINDING = {
  adapter: "teleop",
  axis_mapping: {
    x: { component: "linear_x" },
    y: { component: "linear_y" },
    modes: {
      b2: { x: { component: "angular_x" }, y: { component: "angular_y" } },
    },
  },
};

describe("local mode axis maps", () => {
  it("uses the base map when no mode is active", () => {
    expect(readWidgetAxisMap(BINDING)).toEqual({
      x: { component: "linear_x" },
      y: { component: "linear_y" },
    });
  });

  it("uses the base map for a mode with no override", () => {
    expect(readWidgetAxisMap(BINDING, "b1")).toEqual({
      x: { component: "linear_x" },
      y: { component: "linear_y" },
    });
  });

  it("swaps the whole map for a mode that overrides it", () => {
    expect(readWidgetAxisMap(BINDING, "b2")).toEqual({
      x: { component: "angular_x" },
      y: { component: "angular_y" },
    });
  });

  it("matches the mode name case-insensitively", () => {
    expect(readWidgetAxisMap(BINDING, "  B2 ")).toEqual({
      x: { component: "angular_x" },
      y: { component: "angular_y" },
    });
  });

  it("drives different components from the same stick deflection", () => {
    const deflection = { x: 0.5, y: -0.25 };

    const b1Map = readWidgetAxisMap(BINDING, "b1");
    const b2Map = readWidgetAxisMap(BINDING, "b2");
    expect(b1Map).toBeDefined();
    expect(b2Map).toBeDefined();

    const b1 = contributionFromAxisMap(b1Map ?? {}, deflection);
    const b2 = contributionFromAxisMap(b2Map ?? {}, deflection);

    expect(b1).toEqual({ linear_x: 0.5, linear_y: -0.25 });
    expect(b2).toEqual({ angular_x: 0.5, angular_y: -0.25 });
  });

  it("ignores a mode override that names no valid component", () => {
    const binding = {
      axis_mapping: { x: { component: "linear_x" }, modes: { b2: { x: { component: "nope" } } } },
    };

    expect(readWidgetAxisMap(binding, "b2")).toEqual({ x: { component: "linear_x" } });
  });
});
