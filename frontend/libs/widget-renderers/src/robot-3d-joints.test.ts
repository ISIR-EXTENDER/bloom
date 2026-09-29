/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { drivableJointCount, isMimicJoint, jointsMoved, readJointValues } from "./robot-3d-joints";
import { createMeshCache, parseRobot } from "./robot-3d-model";

/** A gripper: one driven finger, the other mimicking it the way Robotiq and Kinova hands are described. */
const URDF = `<robot name="hand">
  <link name="base_link"/>
  <link name="upper"/>
  <link name="finger_left"/>
  <link name="finger_right"/>
  <link name="tip"/>
  <joint name="shoulder" type="revolute"><parent link="base_link"/><child link="upper"/><axis xyz="0 0 1"/><limit lower="-3" upper="3" effort="1" velocity="1"/></joint>
  <joint name="finger" type="prismatic"><parent link="upper"/><child link="finger_left"/><axis xyz="1 0 0"/><limit lower="0" upper="0.05" effort="1" velocity="1"/></joint>
  <joint name="finger_mirror" type="prismatic"><parent link="upper"/><child link="finger_right"/><axis xyz="-1 0 0"/><limit lower="0" upper="0.05" effort="1" velocity="1"/><mimic joint="finger" multiplier="1" offset="0.01"/></joint>
  <joint name="wrist" type="fixed"><parent link="finger_left"/><child link="tip"/></joint>
</robot>`;

function robot() {
  return parseRobot(URDF, createMeshCache({ asset: async () => null, load: async () => URDF })).robot;
}

describe("joint states on the drawn robot", () => {
  it("tells a mimic joint from the ones the state drives", () => {
    const arm = robot();
    expect(isMimicJoint(arm.joints.finger_mirror as never)).toBe(true);
    expect(isMimicJoint(arm.joints.finger as never)).toBe(false);
    // Fixed joints never move and mimics follow their master: neither counts as drivable.
    expect(drivableJointCount(arm)).toBe(2);
  });

  it("applies only finite values for joints the robot drives itself; the master moves its mimic", () => {
    const arm = robot();
    const values = readJointValues(arm, {
      name: ["shoulder", "finger", "finger_mirror", "elbow", 7],
      position: [0.5, 0.02, 0.9, 1, 1],
    });
    // The mimic named in the state is left to its master: a direct value would fight the mimic rule.
    expect(values).toEqual({ shoulder: 0.5, finger: 0.02 });
    arm.setJointValues(values);
    expect(arm.joints.finger?.angle).toBeCloseTo(0.02);
    expect(arm.joints.finger_mirror?.angle).toBeCloseTo(0.03);
  });

  it("drops NaN, non-numeric and missing positions rather than freezing the joint at a bad value", () => {
    const arm = robot();
    expect(readJointValues(arm, { name: ["shoulder", "finger"], position: [Number.NaN, "0.1"] })).toEqual({});
    expect(readJointValues(arm, { name: ["shoulder"], position: [] })).toEqual({});
    expect(readJointValues(arm, { name: "shoulder", position: 1 })).toEqual({});
    expect(readJointValues(arm, undefined)).toEqual({});
  });

  it("sees no movement in a repeated state, and movement in any joint that is new or moved", () => {
    expect(jointsMoved({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(jointsMoved({ a: 1, b: 2 }, { a: 1 + 1e-6, b: 2 })).toBe(false);
    expect(jointsMoved({ a: 1, b: 2 }, { a: 1.001, b: 2 })).toBe(true);
    expect(jointsMoved({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(jointsMoved({}, {})).toBe(false);
  });
});
