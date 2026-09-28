/**
 * @vitest-environment jsdom
 */
import { Color, Group, Quaternion } from "three";
import { describe, expect, it } from "vitest";
import { GoalMarkers } from "./robot-3d-goals";

const pose = (x: number, w = 1) => ({ position: { x, y: 0, z: 0.3 }, orientation: { x: 0, y: 0, z: 0, w } });
const PALETTE = { command: new Color("#3b6fd1"), robot: new Color("#7e967e") };

describe("shared-control goals on the robot", () => {
  it("draws one named marker per goal in the base frame, drops extras, and ignores another frame", () => {
    const root = new Group();
    const markers = new GoalMarkers(root, "base_link", PALETTE);

    expect(markers.setGoals({ header: { frame_id: "base_link" }, poses: [pose(0.5), pose(0.6)] })).toEqual({
      drawn: 2,
      ignored: 0,
    });
    expect(root.children.map((child) => child.name)).toEqual(["goal_0", "goal_1"]);
    expect(root.children[1]?.position.x).toBe(0.6);

    // An empty frame id is the base frame, as the manager reads it.
    expect(markers.setGoals({ header: { frame_id: "" }, poses: [pose(0.7)] })).toEqual({ drawn: 1, ignored: 0 });
    expect(root.children.map((child) => child.name)).toEqual(["goal_0"]);

    // The manager ignores goals in any other frame, so the view draws none and says how many it left out.
    expect(markers.setGoals({ header: { frame_id: "camera" }, poses: [pose(0.7), pose(0.8)] })).toEqual({
      drawn: 0,
      ignored: 2,
    });
    expect(root.children).toHaveLength(0);
    expect(markers.setGoals(undefined)).toEqual({ drawn: 0, ignored: 0 });
  });

  it("shows the soft goal only while a base-frame pose arrives, distinct from the goals", () => {
    const root = new Group();
    const markers = new GoalMarkers(root, "base_link", PALETTE);
    expect(markers.setSoftGoal({ header: { frame_id: "base_link" }, pose: pose(0.4) })).toBe(true);
    const soft = root.children[0];
    expect(soft?.visible).toBe(true);
    expect(soft?.position.x).toBe(0.4);
    expect(soft?.name).toBe("");
    markers.face(new Quaternion());
    // A new palette recolours the soft goal in place and redraws the goals.
    markers.setGoals({ header: { frame_id: "" }, poses: [pose(0.5)] });
    markers.setColors({ command: new Color("#ff0000"), robot: new Color("#00ff00") });
    expect(root.children.map((child) => child.name)).toContain("goal_0");
    expect(markers.setSoftGoal({ header: { frame_id: "camera" }, pose: pose(0.4) })).toBe(false);
    expect(soft?.visible).toBe(false);
    expect(markers.setSoftGoal(undefined)).toBe(false);
    markers.dispose();
    expect(root.children).toHaveLength(0);
  });
});
