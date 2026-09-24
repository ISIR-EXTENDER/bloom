import {
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Quaternion,
  Vector3,
} from "three";
import { arrowAlongZ, disposeObject } from "./robot-3d-markers";
import type { CommandedTwist } from "./types";

export const COMMAND_COLOR = new Color("#3b6fd1");
/** A full-scale linear twist draws this long; the manager sets the real speed downstream. */
export const COMMAND_ARROW_METRES = 0.35;
/** A full-scale angular twist draws half a turn around its axis, at this radius from the tool. */
export const COMMAND_ARC_RADIUS = 0.12;
export const COMMAND_ARC_FULL_TURN = Math.PI;
/** Below this, on both parts, the runtime is sending a zero and nothing is drawn. */
export const COMMAND_DEADBAND = 0.05;

export type CommandPose = {
  angular: { axis: Vector3; turn: number } | null;
  linear: { direction: Vector3; length: number } | null;
  origin: Vector3;
};

export function isMoving(command: CommandedTwist | undefined): boolean {
  if (!command) {
    return false;
  }
  return magnitude(command.linear) > COMMAND_DEADBAND || magnitude(command.angular) > COMMAND_DEADBAND;
}

/**
 * Where to draw a twist, in the robot's base frame: linear is always in the base frame, angular in the
 * frame the twist names, which is the tool's when it is the effector frame and the base otherwise.
 */
export function commandPose(
  command: CommandedTwist,
  tool: { position: Vector3; quaternion: Quaternion },
  effectorFrameIds: readonly string[],
): CommandPose {
  const linearMagnitude = magnitude(command.linear);
  const linear =
    linearMagnitude > COMMAND_DEADBAND
      ? {
          direction: new Vector3(command.linear.x, command.linear.y, command.linear.z).normalize(),
          length: COMMAND_ARROW_METRES * Math.min(1, linearMagnitude),
        }
      : null;
  const angularMagnitude = magnitude(command.angular);
  let angular: CommandPose["angular"] = null;
  if (angularMagnitude > COMMAND_DEADBAND) {
    const axis = new Vector3(command.angular.x, command.angular.y, command.angular.z).normalize();
    if (command.frameId && effectorFrameIds.includes(command.frameId)) {
      axis.applyQuaternion(tool.quaternion);
    }
    angular = { axis, turn: COMMAND_ARC_FULL_TURN * Math.min(1, angularMagnitude) };
  }
  return { angular, linear, origin: tool.position.clone() };
}

/** The arc of an angular command: points around the axis from the origin, right-handed. */
export function arcPoints(origin: Vector3, axis: Vector3, turn: number, radius: number, segments = 32): Vector3[] {
  const u = perpendicular(axis);
  const v = new Vector3().crossVectors(axis, u).normalize();
  const points: Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (turn * index) / segments;
    points.push(
      origin
        .clone()
        .addScaledVector(u, radius * Math.cos(angle))
        .addScaledVector(v, radius * Math.sin(angle)),
    );
  }
  return points;
}

function perpendicular(axis: Vector3): Vector3 {
  const helper = Math.abs(axis.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  return new Vector3().crossVectors(axis, helper).normalize();
}

function magnitude(part: { x: number; y: number; z: number }): number {
  return Math.hypot(part.x, part.y, part.z);
}

/** One arrow and one arc, moved on every twist rather than rebuilt: twenty a second must not leak. */
export class CommandIndicator {
  readonly root = new Group();
  private readonly material = new MeshStandardMaterial({ color: COMMAND_COLOR });
  private readonly arrow = arrowAlongZ(1 - 0.23, 0.012, 0.23, 0.036, this.material);
  private readonly arcMaterial = new LineBasicMaterial({ color: COMMAND_COLOR, linewidth: 2 });
  private arc: Line | null = null;
  private readonly arcHead = new Mesh(new ConeGeometry(0.014, 0.036, 12).rotateX(Math.PI / 2), this.material);

  constructor() {
    this.root.add(this.arrow, this.arcHead);
    this.root.visible = false;
  }

  attach(parent: Object3D): void {
    parent.add(this.root);
  }

  update(pose: CommandPose | null): void {
    if (!pose || (!pose.linear && !pose.angular)) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.arrow.visible = pose.linear !== null;
    if (pose.linear) {
      this.arrow.position.copy(pose.origin);
      this.arrow.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), pose.linear.direction);
      this.arrow.scale.set(1, 1, pose.linear.length);
    }
    this.arc?.removeFromParent();
    this.arc?.geometry.dispose();
    this.arc = null;
    this.arcHead.visible = pose.angular !== null;
    if (pose.angular) {
      const points = arcPoints(pose.origin, pose.angular.axis, pose.angular.turn, COMMAND_ARC_RADIUS);
      this.arc = new Line(new BufferGeometry().setFromPoints(points), this.arcMaterial);
      this.root.add(this.arc);
      const end = points[points.length - 1] as Vector3;
      const before = points[points.length - 2] as Vector3;
      this.arcHead.position.copy(end);
      this.arcHead.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), end.clone().sub(before).normalize());
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.arc?.geometry.dispose();
    this.arcMaterial.dispose();
    disposeObject(this.root);
  }
}
