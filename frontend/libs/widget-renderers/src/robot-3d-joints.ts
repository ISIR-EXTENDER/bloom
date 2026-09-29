import type { URDFJoint, URDFRobot } from "urdf-loader";

export type JointStateSample = { name?: unknown; position?: unknown };

/** A joint that moved less than this since the last draw has not moved. */
export const JOINT_EPSILON = 1e-5;

/** A mimic joint follows its master; a state naming it directly is not applied. */
export function isMimicJoint(joint: URDFJoint): boolean {
  const mimicked = (joint as { mimicJoint?: unknown }).mimicJoint;
  return typeof mimicked === "string" && mimicked !== "";
}

/** The joints a state can drive: the moving joints the URDF declares, mimics left to their masters. */
export function drivableJointCount(robot: URDFRobot): number {
  return Object.values(robot.joints).filter((joint) => joint.jointType !== "fixed" && !isMimicJoint(joint)).length;
}

/** The finite values a state carries for joints the robot drives itself; anything else is ignored. */
export function readJointValues(robot: URDFRobot, sample: JointStateSample | undefined): Record<string, number> {
  const names = Array.isArray(sample?.name) ? sample.name : [];
  const positions = Array.isArray(sample?.position) ? sample.position : [];
  const values: Record<string, number> = {};
  names.forEach((name, index) => {
    const position = positions[index];
    if (typeof name !== "string" || typeof position !== "number" || !Number.isFinite(position)) {
      return;
    }
    const joint = robot.joints[name];
    if (joint && !isMimicJoint(joint)) {
      values[name] = position;
    }
  });
  return values;
}

/** Whether any joint in `next` is new or moved more than the epsilon since `previous`. */
export function jointsMoved(previous: Record<string, number>, next: Record<string, number>): boolean {
  return Object.entries(next).some(
    ([name, position]) => previous[name] === undefined || Math.abs(previous[name] - position) > JOINT_EPSILON,
  );
}
