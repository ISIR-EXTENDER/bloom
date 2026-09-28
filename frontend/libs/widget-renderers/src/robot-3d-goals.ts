import {
  AxesHelper,
  type Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RingGeometry,
  SphereGeometry,
} from "three";
import { asRecord, disposeObject, numberOf, textSprite, vector } from "./robot-3d-markers";

/** A `geometry_msgs/msg/PoseArray` as the runtime socket hands it over. */
export type PoseArraySample = { header?: unknown; poses?: unknown };
type PoseStampedSample = { header?: unknown; pose?: unknown };

/** Goals take the palette's robot colour, the soft goal its command colour and a larger size: the two never read alike. */
const GOAL_RADIUS = 0.015;
const SOFT_GOAL_RADIUS = 0.03;

/**
 * Shared control drawn on the robot: one small triad and sphere per goal, named as the manager names them
 * (goal_<index>), and the confidence-weighted soft goal as a larger ringed sphere. Each message replaces the set.
 * The manager reads goals in its base frame only and ignores any other, so a message in another frame draws nothing.
 */
export class GoalMarkers {
  private readonly goals: Group[] = [];
  private readonly soft: Group;
  private readonly softRing: Mesh;
  private readonly softMaterials: MeshStandardMaterial[];
  private readonly root: Object3D;
  private readonly baseFrame: string;
  private goalColor: Color;
  private lastGoals: PoseArraySample | undefined;

  constructor(root: Object3D, baseFrame: string, colors: { command: Color; robot: Color }) {
    this.root = root;
    this.baseFrame = baseFrame;
    this.goalColor = colors.robot.clone();
    this.soft = new Group();
    this.softMaterials = [softMaterial(colors.command, 0.55), softMaterial(colors.command, 0.9)];
    const body = new Mesh(new SphereGeometry(SOFT_GOAL_RADIUS, 20, 14), this.softMaterials[0]);
    this.softRing = new Mesh(
      new RingGeometry(SOFT_GOAL_RADIUS * 1.4, SOFT_GOAL_RADIUS * 1.8, 32),
      this.softMaterials[1],
    );
    this.soft.add(body, this.softRing, new AxesHelper(SOFT_GOAL_RADIUS * 4));
    this.soft.visible = false;
  }

  /** A palette picked in Settings: the soft goal is recoloured, the goals redrawn with their labels. */
  setColors(colors: { command: Color; robot: Color }): void {
    for (const material of this.softMaterials) {
      material.color.copy(colors.command);
    }
    this.goalColor = colors.robot.clone();
    const drawn = this.lastGoals;
    this.setGoals(undefined);
    this.setGoals(drawn);
  }

  /** Draws the goals a PoseArray holds and returns how many were drawn and how many the manager would ignore. */
  setGoals(sample: PoseArraySample | undefined): { drawn: number; ignored: number } {
    this.lastGoals = sample;
    const all = Array.isArray(sample?.poses) ? sample.poses : [];
    const inBase = this.inBaseFrame(sample?.header);
    const poses = inBase ? all : [];
    const parent = this.root;
    while (this.goals.length > poses.length) {
      const extra = this.goals.pop();
      if (extra) {
        extra.removeFromParent();
        disposeObject(extra);
      }
    }
    poses.forEach((pose, index) => {
      let marker = this.goals[index];
      if (!marker) {
        marker = goalMarker(`goal_${index}`, this.goalColor);
        this.goals.push(marker);
      }
      if (marker.parent !== parent) {
        parent.add(marker);
      }
      placeAt(marker, asRecord(pose));
    });
    return { drawn: this.goals.length, ignored: inBase ? 0 : all.length };
  }

  /** Draws the soft goal a PoseStamped names in the base frame and says whether it is shown. */
  setSoftGoal(sample: PoseStampedSample | undefined): boolean {
    const body = sample ? asRecord(sample.pose) : null;
    if (!body || !("position" in body) || !this.inBaseFrame(sample?.header)) {
      this.soft.visible = false;
      return false;
    }
    const parent = this.root;
    if (this.soft.parent !== parent) {
      parent.add(this.soft);
    }
    placeAt(this.soft, body);
    this.soft.visible = true;
    return true;
  }

  /** The ring faces the camera the way rviz's discs do not need to: a billboard reads as a target from anywhere. */
  face(cameraQuaternion: Quaternion): void {
    if (this.soft.visible) {
      this.softRing.quaternion.copy(this.soft.getWorldQuaternion(new Quaternion()).invert().multiply(cameraQuaternion));
    }
  }

  dispose(): void {
    for (const goal of this.goals) {
      goal.removeFromParent();
      disposeObject(goal);
    }
    this.goals.length = 0;
    this.soft.removeFromParent();
    disposeObject(this.soft);
  }

  /** An empty frame id is the base frame, as the manager reads it. */
  private inBaseFrame(header: unknown): boolean {
    const frameId = String(asRecord(header).frame_id ?? "").replace(/^\//, "");
    return frameId === "" || frameId === this.baseFrame;
  }
}

function goalMarker(name: string, color: Color): Group {
  const group = new Group();
  group.name = name;
  const material = new MeshStandardMaterial({ color });
  group.add(new Mesh(new SphereGeometry(GOAL_RADIUS, 16, 12), material), new AxesHelper(GOAL_RADIUS * 4));
  const label = textSprite(name, 0.03, color, 1);
  label.position.z = GOAL_RADIUS * 3;
  group.add(label);
  return group;
}

function placeAt(object: Object3D, pose: Record<string, unknown>): void {
  object.position.copy(vector(pose.position, 0));
  const orientation = asRecord(pose.orientation);
  const quaternion = new Quaternion(
    numberOf(orientation.x),
    numberOf(orientation.y),
    numberOf(orientation.z),
    numberOf(orientation.w),
  );
  object.quaternion.copy(quaternion.lengthSq() > 0 ? quaternion.normalize() : new Quaternion());
}

function softMaterial(color: Color, opacity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, opacity, transparent: true, depthWrite: false });
}
