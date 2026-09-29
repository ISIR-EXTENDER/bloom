/**
 * @vitest-environment jsdom
 */
import { gripperToggleSettings } from "@bloom/widgets";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { readJointValues } from "./robot-3d-joints";
import { createMeshCache, parseRobot } from "./robot-3d-model";

// The gripper chains as xacro expands them (explorer_description + gripper_pincette; kortex gen3 + robotiq_2f_85),
// visuals dropped: the directions below are the URDFs' own, not a model of them.
const PINCETTE = `<robot name="explorer_pincette">
  <link name="structure"/>
  <link name="right_finger_first_phalanx"/>
  <link name="right_external_rod"/>
  <link name="right_finger_last_phalanx"/>
  <link name="left_finger_first_phalanx"/>
  <link name="left_external_rod"/>
  <link name="left_finger_last_phalanx"/>
  <joint name="right_finger_joint" type="revolute"><parent link="structure"/><child link="right_finger_first_phalanx"/><origin xyz="0.015 -0.038 0.1015" rpy="0 -1.57 0"/><axis xyz="0 0 1"/><limit lower="0.0" upper="1.05" effort="1000.0" velocity="2.5"/></joint>
  <joint name="right_external_rod_joint" type="revolute"><parent link="structure"/><child link="right_external_rod"/><origin xyz="0.012 -0.054 0.1069" rpy="3.14 -1.57 0"/><axis xyz="0 0 1"/><limit lower="-1.05" upper="0.0" effort="1000.0" velocity="2.5"/><mimic joint="right_finger_joint" multiplier="-1" offset="0"/></joint>
  <joint name="right_fingertip_joint" type="revolute"><parent link="right_external_rod"/><child link="right_finger_last_phalanx"/><origin xyz="0.0433 0.025 0" rpy="3.14 0 0"/><axis xyz="0 0 1"/><limit lower="-1.05" upper="0.0" effort="1000.0" velocity="2.5"/><mimic joint="right_finger_joint" multiplier="-1" offset="0"/></joint>
  <joint name="left_finger_joint" type="revolute"><parent link="structure"/><child link="left_finger_first_phalanx"/><origin xyz="0.015 0.038 0.1015" rpy="0 -1.57 0"/><axis xyz="0 0 1"/><limit lower="-1.05" upper="0.0" effort="1000.0" velocity="2.5"/><mimic joint="right_finger_joint" multiplier="-1" offset="0"/></joint>
  <joint name="left_external_rod_joint" type="revolute"><parent link="structure"/><child link="left_external_rod"/><origin xyz="0.012 0.054 0.1069" rpy="0 -1.57 0"/><axis xyz="0 0 1"/><limit lower="-1.05" upper="0.0" effort="1000.0" velocity="2.5"/><mimic joint="right_finger_joint" multiplier="-1" offset="0"/></joint>
  <joint name="left_fingertip_joint" type="revolute"><parent link="left_external_rod"/><child link="left_finger_last_phalanx"/><origin xyz="0.0433 0.025 0" rpy="3.14 0 0"/><axis xyz="0 0 1"/><limit lower="-1.05" upper="0.0" effort="1000.0" velocity="2.5"/><mimic joint="right_finger_joint" multiplier="-1" offset="0"/></joint>
</robot>`;

const ROBOTIQ = `<robot name="robotiq_2f_85">
  <link name="robotiq_85_base_link"/>
  <link name="robotiq_85_left_knuckle_link"/>
  <link name="robotiq_85_right_knuckle_link"/>
  <link name="robotiq_85_left_finger_link"/>
  <link name="robotiq_85_right_finger_link"/>
  <link name="robotiq_85_left_inner_knuckle_link"/>
  <link name="robotiq_85_right_inner_knuckle_link"/>
  <link name="robotiq_85_left_finger_tip_link"/>
  <link name="robotiq_85_right_finger_tip_link"/>
  <joint name="robotiq_85_left_knuckle_joint" type="revolute"><parent link="robotiq_85_base_link"/><child link="robotiq_85_left_knuckle_link"/><origin xyz="0.03060114 0.0 0.05490452" rpy="0 0 0"/><axis xyz="0 -1 0"/><limit lower="0.0" upper="0.8" effort="50" velocity="0.5"/></joint>
  <joint name="robotiq_85_right_knuckle_joint" type="revolute"><parent link="robotiq_85_base_link"/><child link="robotiq_85_right_knuckle_link"/><origin xyz="-0.03060114 0.0 0.05490452" rpy="0 0 0"/><axis xyz="0 -1 0"/><limit lower="-0.8" upper="0.0" effort="50" velocity="0.5"/><mimic joint="robotiq_85_left_knuckle_joint" multiplier="-1"/></joint>
  <joint name="robotiq_85_left_finger_joint" type="fixed"><parent link="robotiq_85_left_knuckle_link"/><child link="robotiq_85_left_finger_link"/><origin xyz="0.03152616 0.0 -0.00376347" rpy="0 0 0"/></joint>
  <joint name="robotiq_85_right_finger_joint" type="fixed"><parent link="robotiq_85_right_knuckle_link"/><child link="robotiq_85_right_finger_link"/><origin xyz="-0.03152616 0.0 -0.00376347" rpy="0 0 0"/></joint>
  <joint name="robotiq_85_left_inner_knuckle_joint" type="revolute"><parent link="robotiq_85_base_link"/><child link="robotiq_85_left_inner_knuckle_link"/><origin xyz="0.0127 0.0 0.06142" rpy="0 0 0"/><axis xyz="0 -1 0"/><limit lower="0.0" upper="0.8" effort="50" velocity="0.5"/><mimic joint="robotiq_85_left_knuckle_joint"/></joint>
  <joint name="robotiq_85_right_inner_knuckle_joint" type="revolute"><parent link="robotiq_85_base_link"/><child link="robotiq_85_right_inner_knuckle_link"/><origin xyz="-0.0127 0.0 0.06142" rpy="0 0 0"/><axis xyz="0 -1 0"/><limit lower="-0.8" upper="0.0" effort="50" velocity="0.5"/><mimic joint="robotiq_85_left_knuckle_joint" multiplier="-1"/></joint>
  <joint name="robotiq_85_left_finger_tip_joint" type="revolute"><parent link="robotiq_85_left_finger_link"/><child link="robotiq_85_left_finger_tip_link"/><origin xyz="0.00563134 0.0 0.04718515" rpy="0 0 0"/><axis xyz="0 -1 0"/><limit lower="-0.8" upper="0.0" effort="50" velocity="0.5"/><mimic joint="robotiq_85_left_knuckle_joint" multiplier="-1"/></joint>
  <joint name="robotiq_85_right_finger_tip_joint" type="revolute"><parent link="robotiq_85_right_finger_link"/><child link="robotiq_85_right_finger_tip_link"/><origin xyz="-0.00563134 0.0 0.04718515" rpy="0 0 0"/><axis xyz="0 -1 0"/><limit lower="0.0" upper="0.8" effort="50" velocity="0.5"/><mimic joint="robotiq_85_left_knuckle_joint"/></joint>
</robot>`;

const HANDS = [
  {
    robot: "Explorer",
    urdf: PINCETTE,
    master: "right_finger_joint",
    tips: ["right_finger_last_phalanx", "left_finger_last_phalanx"],
    // What joint_state_broadcaster publishes for each mimic, from ros2_control's multiplier -1.
    mimics: [
      ["right_external_rod_joint", -1],
      ["right_fingertip_joint", -1],
      ["left_finger_joint", -1],
      ["left_external_rod_joint", -1],
      ["left_fingertip_joint", -1],
    ],
    // Measured with the URDF's own forward kinematics: 139.8 mm apart at 0.2 rad, 57.8 mm at 1.05 rad.
    gapMm: { open: 139.8, closed: 57.8 },
  },
  {
    robot: "Kinova",
    urdf: ROBOTIQ,
    master: "robotiq_85_left_knuckle_joint",
    tips: ["robotiq_85_left_finger_tip_link", "robotiq_85_right_finger_tip_link"],
    mimics: [
      ["robotiq_85_right_knuckle_joint", -1],
      ["robotiq_85_left_inner_knuckle_joint", 1],
      ["robotiq_85_right_inner_knuckle_joint", -1],
      ["robotiq_85_left_finger_tip_joint", -1],
      ["robotiq_85_right_finger_tip_joint", 1],
    ],
    gapMm: { open: 135.5, closed: 50.7 },
  },
] as const;

function payloadValue(payload: unknown): number {
  const match = /\[\s*(-?[\d.]+)\s*\]/.exec(String(payload));
  if (!match) {
    throw new Error(`no value in ${String(payload)}`);
  }
  return Number(match[1]);
}

function drawnGapMm(
  urdf: string,
  master: string,
  value: number,
  mimics: readonly (readonly [string, number])[],
  tips: readonly string[],
) {
  const { robot } = parseRobot(urdf, createMeshCache({ asset: async () => null, load: async () => urdf }));
  // The state names the master and every mimic, as ros2_control publishes them; the view applies the master only.
  const sample = {
    name: [master, ...mimics.map(([name]) => name)],
    position: [value, ...mimics.map(([, multiplier]) => multiplier * value)],
  };
  robot.setJointValues(readJointValues(robot, sample));
  robot.updateMatrixWorld(true);
  const [a, b] = tips.map((tip) => robot.links[tip]?.getWorldPosition(new Vector3()));
  if (!a || !b) {
    throw new Error(`missing ${tips.join(" or ")}`);
  }
  return a.distanceTo(b) * 1000;
}

describe("the gripper words on the drawn hand", () => {
  for (const hand of HANDS) {
    it(`${hand.robot}: "Open gripper" draws the fingers wider apart than "Close gripper"`, () => {
      const settings = gripperToggleSettings(hand.robot) as Record<string, unknown>;
      // Pressing "Open gripper" sends the off payload, "Close gripper" the on payload (the toggle's action words).
      expect(settings.onLabel).toBe("Open gripper");
      expect(settings.onStateLabel).toBe("closed");
      const open = payloadValue(settings.offPayload);
      const closed = payloadValue(settings.onPayload);
      const openGap = drawnGapMm(hand.urdf, hand.master, open, hand.mimics, hand.tips);
      const closedGap = drawnGapMm(hand.urdf, hand.master, closed, hand.mimics, hand.tips);
      expect(openGap).toBeGreaterThan(closedGap + 40);
      expect(openGap).toBeCloseTo(hand.gapMm.open, 0);
      expect(closedGap).toBeCloseTo(hand.gapMm.closed, 0);
    });
  }
});
