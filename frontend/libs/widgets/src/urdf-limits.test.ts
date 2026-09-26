import { describe, expect, it } from "vitest";
import { readUrdfJointLimits } from "./urdf-limits";

describe("joint limits from the robot description", () => {
  it("reads each bounded joint's range, and leaves continuous and fixed joints out", () => {
    const urdf = `<robot name="arm">
      <joint name="joint_1" type="revolute"><limit effort="10" lower="-2.5" upper="2.5" velocity="1"/></joint>
      <joint type="prismatic" name="slide"><limit upper="0.3" lower="0"/></joint>
      <joint name="wrist" type="continuous"><limit effort="5" velocity="1"/></joint>
      <joint name="mount" type="fixed"/>
      <joint name="mount_2" type="fixed"></joint>
    </robot>`;

    expect(readUrdfJointLimits(urdf)).toEqual({ joint_1: [-2.5, 2.5], slide: [0, 0.3] });
  });

  it("keeps the joint that follows a self-closing one", () => {
    const urdf = '<joint name="a" type="fixed"/><joint name="b" type="revolute"><limit lower="-1" upper="1"/></joint>';

    expect(readUrdfJointLimits(urdf)).toEqual({ b: [-1, 1] });
  });
});
