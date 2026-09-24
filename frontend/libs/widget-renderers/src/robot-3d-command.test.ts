import { Group, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  arcPoints,
  COMMAND_ARC_FULL_TURN,
  COMMAND_ARC_RADIUS,
  COMMAND_ARROW_METRES,
  CommandIndicator,
  commandPose,
  isMoving,
} from "./robot-3d-command";

const ZERO = { x: 0, y: 0, z: 0 };
const TOOL = {
  position: new Vector3(0.3, 0, 0.5),
  quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
};

describe("the commanded twist", () => {
  it("is moving on either part, past the deadband", () => {
    expect(isMoving(undefined)).toBe(false);
    expect(isMoving({ linear: ZERO, angular: ZERO })).toBe(false);
    expect(isMoving({ linear: { x: 0.04, y: 0, z: 0 }, angular: ZERO })).toBe(false);
    expect(isMoving({ linear: ZERO, angular: { x: 0, y: 0, z: 0.5 } })).toBe(true);
  });

  it("draws the linear part from the tool in the base frame, full scale at the set length", () => {
    const pose = commandPose({ linear: { x: 0, y: 2, z: 0 }, angular: ZERO, frameId: "effector_frame" }, TOOL, [
      "effector_frame",
    ]);
    expect(pose.origin.toArray()).toEqual([0.3, 0, 0.5]);
    expect(pose.linear?.direction.toArray()).toEqual([0, 1, 0]);
    expect(pose.linear?.length).toBeCloseTo(COMMAND_ARROW_METRES, 6);
    expect(pose.angular).toBeNull();
  });

  it("scales a partial twist and drops a part inside the deadband", () => {
    const pose = commandPose({ linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.02 } }, TOOL, []);
    expect(pose.linear?.length).toBeCloseTo(COMMAND_ARROW_METRES / 2, 6);
    expect(pose.angular).toBeNull();
  });

  it("turns the angular axis into the tool's frame only when the twist names it", () => {
    const twist = { linear: ZERO, angular: { x: 1, y: 0, z: 0 } };
    const base = commandPose({ ...twist, frameId: "base_link" }, TOOL, ["effector_frame"]);
    expect(base.angular?.axis.toArray().map((value) => Math.round(value * 1000) / 1000)).toEqual([1, 0, 0]);
    expect(base.angular?.turn).toBeCloseTo(COMMAND_ARC_FULL_TURN, 6);
    const tool = commandPose({ ...twist, frameId: "effector_frame" }, TOOL, ["effector_frame"]);
    expect(tool.angular?.axis.toArray().map((value) => Math.round(value * 1000) / 1000)).toEqual([0, 1, 0]);
    const named = commandPose({ ...twist, frameId: "ft_frame" }, TOOL, ["effector_frame", "ft_frame"]);
    expect(named.angular?.axis.y).toBeCloseTo(1, 6);
  });

  it("lays the arc around the axis at the set radius, right-handed", () => {
    const points = arcPoints(new Vector3(), new Vector3(0, 0, 1), Math.PI / 2, COMMAND_ARC_RADIUS, 2);
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.length()).toBeCloseTo(COMMAND_ARC_RADIUS, 6);
      expect(point.z).toBeCloseTo(0, 6);
    }
    const start = points[0] as Vector3;
    const end = points[2] as Vector3;
    expect(new Vector3().crossVectors(start, end).z).toBeGreaterThan(0);
  });

  it("keeps one arrow and one arc, shown or hidden, never rebuilt", () => {
    const parent = new Group();
    const indicator = new CommandIndicator();
    indicator.attach(parent);
    expect(indicator.root.visible).toBe(false);
    const linear = commandPose({ linear: { x: 1, y: 0, z: 0 }, angular: ZERO }, TOOL, []);
    indicator.update(linear);
    const arrow = indicator.root.children[0];
    expect(indicator.root.visible).toBe(true);
    expect(arrow?.visible).toBe(true);
    expect(arrow?.scale.z).toBeCloseTo(COMMAND_ARROW_METRES, 6);
    indicator.update(commandPose({ linear: ZERO, angular: { x: 0, y: 0, z: 1 } }, TOOL, []));
    expect(indicator.root.children[0]).toBe(arrow);
    expect(arrow?.visible).toBe(false);
    expect(indicator.root.children.some((child) => child.type === "Line")).toBe(true);
    indicator.update(null);
    expect(indicator.root.visible).toBe(false);
    indicator.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
