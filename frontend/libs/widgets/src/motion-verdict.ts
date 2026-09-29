/**
 * The verdict on one Drive or gripper gesture: the wire, the pose qontrol commands (/ee_pose) and the hand the joints
 * really put there (the TF tip). One copy of the rules for the Bloom Debug "Command vs motion" panel and the
 * simulation checks (scripts/lib/drive-verdict.mjs). Node loads this file directly, so it imports nothing.
 */

/** A joint more than this short of its command is blocked: a measured wrong sign is then a WARN, not a FAIL. */
export const BLOCKED_JOINT_RAD = 0.1;
/** A joint this far short of its command is listed beside a verdict. */
export const SHORT_JOINT_RAD = 0.05;
/** A push must move the hand this far (or turn it this much) to count as following. */
export const MIN_DISPLACEMENT_M = 0.03;
export const MIN_ROTATION_RAD = 0.05;
/** Mostly along the word: the Explorer's Right lands 89-98% along its axis from home, the QP's compromise. */
export const MIN_ALONG = 0.85;
/** A horizontal push may not lower the hand more than this, nor take it this much further from the command. */
export const MAX_SAG_M = 0.01;
export const MAX_COMMAND_GAP_M = 0.015;
/** The hand is read this long after the wire returns to zero. */
export const SETTLE_MS = 800;
/** A gripper press must move the finger at least this far, the right way, within the wait. */
export const MIN_FINGER_TRAVEL_RAD = 0.3;
export const FINGER_WAIT_MS = 4000;

export type Vector3 = { x: number; y: number; z: number };
export type Quaternion = { w: number; x: number; y: number; z: number };
export type Pose = { orientation: Quaternion; position: Vector3 };
export type Twist = { angular: Vector3; linear: Vector3 };
export type MotionRobot = "explorer" | "kinova";

export type MotionProfile = {
  /** Each word's own axis and sign on the wire, pinned so a change to it is a decision, not a drift. */
  words: Readonly<Record<string, string>>;
  /** Words the robot names as not following their axis reliably from its home pose. */
  offAxis: readonly string[];
  /** Why this robot's joints may not follow their command; absent holds the measured hand strictly. */
  jointsMayLag?: string;
  /** qontrol's tip_frame: the measured hand. */
  tipFrame: string;
  /** The finger the gripper controller drives; a larger value is a narrower grip on both URDFs. */
  finger: string;
  /** Why this robot's gripper may not answer a command; absent fails a finger that does not travel. */
  fingerMayStall?: string;
  gripper: { closed: number; open: number };
};

export const MOTION_PROFILES: Readonly<Record<MotionRobot, MotionProfile>> = {
  explorer: {
    // extender_ui's validated Explorer profile (swap XY, invert linear x).
    words: {
      Forward: "linear.x-",
      Right: "linear.y+",
      Up: "linear.z+",
      "Tilt up": "angular.x+",
      "Roll right": "angular.y+",
    },
    // From the home pose +angular.y turns the hand about (-x, +y) at ~72%, and +linear.y lands 80-98% along y.
    offAxis: ["Right", "Roll right"],
    jointsMayLag:
      "the Gazebo arm rests on the ground plane and qontrol runs open loop, so its joints sag and lag behind /ee_pose",
    tipFrame: "ft_frame",
    finger: "right_finger_joint",
    fingerMayStall: "Gazebo's Explorer gripper can ignore commands while the arm is still",
    gripper: { closed: 1.1, open: 0.2 },
  },
  kinova: {
    // The Kinova Manager seed's identity mapping.
    words: {
      Forward: "linear.y+",
      Right: "linear.x+",
      Up: "linear.z+",
      "Tilt up": "angular.y+",
      "Roll right": "angular.x+",
    },
    offAxis: [],
    tipFrame: "end_effector_link",
    finger: "robotiq_85_left_knuckle_joint",
    gripper: { closed: 0.8, open: 0.0 },
  },
};

const OPPOSITE_WORDS: Readonly<Record<string, string>> = {
  Forward: "Back",
  Right: "Left",
  Up: "Down",
  "Tilt up": "Tilt down",
  "Roll right": "Roll left",
};

export type DriveVerdictRow = {
  /** The wire carries the word's own axis and sign. */
  wireOk: boolean;
  /** How far /ee_pose moved against the word (m or rad; <= 0 when it did not). */
  commandedAgainst: number;
  /** /ee_pose moved far enough and mostly along the word. */
  commandedFollowed: boolean;
  measuredAgainst: number;
  measuredFollowed: boolean;
  /** A horizontal push lowered the measured hand past the limit. */
  sagged: boolean;
  /** The push left the measured hand further from the command than the limit. */
  drifted: boolean;
  /** The largest |command - joint| at the end of the push, in rad. */
  maxJointGap: number;
  /** How far against the word counts as the wrong sign. */
  tolerance: number;
  /** The robot names this word as one that may not follow reliably. */
  known: boolean;
  jointsMayLag?: string;
};

export type DriveVerdict = { reasons: string[]; verdict: "fail" | "pass" | "warn" };

/**
 * Bloom's own direction (the wire, and the pose qontrol commands from it) is held strictly on every robot. The
 * measured hand is held strictly where the joints are the command (mock hardware); a robot naming why its joints
 * may not follow (`jointsMayLag`) turns a sag or a lag into a WARN, and a measured wrong sign too, but only while a
 * joint is blocked (more than BLOCKED_JOINT_RAD short of its command): a wrong sign with the joints tracking fails.
 */
export function driveVerdict(row: DriveVerdictRow): DriveVerdict {
  const fail: string[] = [];
  const warn: string[] = [];
  const lenient = Boolean(row.jointsMayLag);
  if (!row.wireOk) fail.push("wire");
  if (row.commandedAgainst > row.tolerance) fail.push("commanded the wrong way");
  if (!row.commandedFollowed && !row.known) fail.push("command did not follow");
  if (row.measuredAgainst > row.tolerance) {
    if (lenient && row.maxJointGap > BLOCKED_JOINT_RAD) warn.push("BLOCKED: measured the wrong way");
    else fail.push("measured the wrong way");
  }
  if (row.sagged) (lenient ? warn : fail).push("sagged");
  if (row.drifted) (lenient ? warn : fail).push("left the command");
  if (!row.measuredFollowed && !(row.measuredAgainst > row.tolerance)) {
    (lenient || row.known ? warn : fail).push("measured short");
  }
  if (fail.length) return { reasons: fail, verdict: "fail" };
  if (warn.length) return { reasons: warn, verdict: "warn" };
  return { reasons: [], verdict: "pass" };
}

export type DriveChip = "blocked" | "follows" | "lags" | "wrong-way";

const WRONG_WAY_REASONS = new Set(["wire", "commanded the wrong way", "measured the wrong way"]);

/** The panel's one word for a verdict: a wrong sign Bloom or the joints produced, a stall, a lag, or none. */
export function driveChip(verdict: DriveVerdict, maxJointGap: number): DriveChip {
  if (verdict.verdict === "pass") return "follows";
  if (verdict.reasons.some((reason) => WRONG_WAY_REASONS.has(reason))) return "wrong-way";
  if (verdict.reasons.some((reason) => reason.startsWith("BLOCKED") || reason === "command did not follow")) {
    return "blocked";
  }
  return maxJointGap > BLOCKED_JOINT_RAD ? "blocked" : "lags";
}

export type WireComponent = { axis: "x" | "y" | "z"; part: "angular" | "linear"; value: number };

/** The one unit component a Drive control puts on the wire, or null for zero or a mixed twist. */
export function wireComponent(wire: Twist): WireComponent | null {
  const components: WireComponent[] = [];
  for (const part of ["linear", "angular"] as const) {
    for (const axis of ["x", "y", "z"] as const) {
      const value = Number(wire[part]?.[axis] ?? 0);
      if (Math.abs(value) > 1e-6) components.push({ axis, part, value });
    }
  }
  return components.length === 1 && Math.abs(components[0].value) > 0.5 ? components[0] : null;
}

export function isZeroTwist(wire: Twist): boolean {
  return ["linear", "angular"].every((part) =>
    ["x", "y", "z"].every((axis) => Math.abs(Number(wire[part as keyof Twist]?.[axis as keyof Vector3] ?? 0)) <= 1e-9),
  );
}

export function wireAxis(component: WireComponent): string {
  return `${component.part}.${component.axis}${component.value > 0 ? "+" : "-"}`;
}

/** The word an operator reads for a wire axis on this robot: a pinned word, its opposite end, or Pivot. */
export function wordForWire(profile: MotionProfile, axis: string): string | null {
  const flipped = axis.endsWith("+") ? `${axis.slice(0, -1)}-` : `${axis.slice(0, -1)}+`;
  for (const [word, pinned] of Object.entries(profile.words)) {
    if (pinned === axis) return word;
    if (pinned === flipped) return OPPOSITE_WORDS[word] ?? null;
  }
  if (axis === "angular.z+") return "Pivot left";
  if (axis === "angular.z-") return "Pivot right";
  return null;
}

export function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** The rotation that takes orientation `from` to `to`, as an axis-angle vector in the base frame. */
export function rotationVector(from: Quaternion, to: Quaternion): Vector3 {
  const c = { w: from.w, x: -from.x, y: -from.y, z: -from.z };
  const a = to;
  const q = {
    w: a.w * c.w - a.x * c.x - a.y * c.y - a.z * c.z,
    x: a.w * c.x + a.x * c.w + a.y * c.z - a.z * c.y,
    y: a.w * c.y - a.x * c.z + a.y * c.w + a.z * c.x,
    z: a.w * c.z + a.x * c.y - a.y * c.x + a.z * c.w,
  };
  const sine = Math.hypot(q.x, q.y, q.z);
  const angle = 2 * Math.atan2(sine, q.w);
  const scale = sine > 1e-9 ? angle / sine : 0;
  return { x: q.x * scale, y: q.y * scale, z: q.z * scale };
}

export type JointGap = { gap: number; name: string };

/** Each arm joint's command minus its position, largest first: a joint blocked by a contact shows here. */
export function jointGaps(
  command: readonly number[] | undefined,
  joints: { name: readonly string[]; position: readonly number[] } | undefined,
): JointGap[] {
  if (!command || !joints) return [];
  return command
    .map((value, index) => {
      const name = `joint_${index + 1}`;
      const at = joints.name.indexOf(name);
      return at < 0 ? null : { gap: value - joints.position[at], name };
    })
    .filter((row): row is JointGap => row !== null)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

export type Follow = { against: number; along: number; magnitude: number; moved: Vector3 };

export type DriveMeasure = {
  commanded: Follow & { followed: boolean };
  component: WireComponent;
  /** How far below its start the measured hand went at its lowest while held, for a horizontal push (m). */
  dip: number;
  /** How much further from qontrol's command the joints left the hand during this push alone (m). */
  gap: number;
  horizontal: boolean;
  maxJointGap: number;
  /** Null without a measured hand: the verdict then rests on the wire and /ee_pose alone. */
  measured: (Follow & { followed: boolean }) | null;
  row: DriveVerdictRow;
  unit: "m" | "rad";
  verdict: DriveVerdict;
  chip: DriveChip;
  wireAxis: string;
  word: string | null;
};

export type DriveInput = {
  wire: Twist;
  profile: MotionProfile;
  start: Pose;
  end: Pose;
  startHand?: Pose | null;
  endHand?: Pose | null;
  /** The lowest z the measured hand reached from the press to the reading; defaults to where it ended. */
  lowestHandZ?: number;
  gaps?: readonly JointGap[];
  /** The word pressed, when the caller knows it; otherwise the wire's own word stands for it. */
  word?: string;
};

/** Judge one push: null when the wire is not a single Drive axis. */
export function measureDrive(input: DriveInput): DriveMeasure | null {
  const component = wireComponent(input.wire);
  if (!component) return null;
  const axis = wireAxis(component);
  const word = input.word ?? wordForWire(input.profile, axis);
  const linear = component.part === "linear";
  const floor = linear ? MIN_DISPLACEMENT_M : MIN_ROTATION_RAD;
  const sign = Math.sign(component.value);
  const follow = (from: Pose, to: Pose): Follow & { followed: boolean } => {
    const moved = linear ? subtract(to.position, from.position) : rotationVector(from.orientation, to.orientation);
    const magnitude = Math.hypot(moved.x, moved.y, moved.z);
    const along = magnitude > 0 ? (moved[component.axis] * sign) / magnitude : 0;
    return {
      against: -moved[component.axis] * sign,
      along,
      followed: magnitude > floor && along > MIN_ALONG,
      magnitude,
      moved,
    };
  };
  const commanded = follow(input.start, input.end);
  const measured = input.startHand && input.endHand ? follow(input.startHand, input.endHand) : null;
  const horizontal = linear && component.axis !== "z";
  const lowest = input.lowestHandZ ?? input.endHand?.position.z;
  const dip =
    horizontal && input.startHand && lowest !== undefined ? Math.max(0, input.startHand.position.z - lowest) : 0;
  const gap =
    input.startHand && input.endHand
      ? distance(input.end.position, input.endHand.position) - distance(input.start.position, input.startHand.position)
      : 0;
  const tolerance = linear ? MAX_SAG_M : MIN_ROTATION_RAD;
  const maxJointGap = Math.max(0, ...(input.gaps ?? []).map((row) => Math.abs(row.gap)));
  const row: DriveVerdictRow = {
    commandedAgainst: commanded.against,
    commandedFollowed: commanded.followed,
    drifted: horizontal && gap > MAX_COMMAND_GAP_M,
    jointsMayLag: input.profile.jointsMayLag,
    known: word !== null && input.profile.offAxis.includes(word),
    maxJointGap,
    measuredAgainst: measured ? measured.against : 0,
    measuredFollowed: measured ? measured.followed : true,
    sagged: dip > MAX_SAG_M,
    tolerance,
    wireOk: input.word === undefined ? true : input.profile.words[input.word] === axis,
  };
  const verdict = driveVerdict(row);
  return {
    chip: driveChip(verdict, maxJointGap),
    commanded,
    component,
    dip,
    gap,
    horizontal,
    maxJointGap,
    measured,
    row,
    unit: linear ? "m" : "rad",
    verdict,
    wireAxis: axis,
    word,
  };
}

export type GripperChip = "moves" | "no-move" | "wrong-way";

/** Close narrows the grip: a larger finger value on both URDFs. The word is the calibrated end the value is nearer. */
export function gripperWord(value: number, profile: MotionProfile): { direction: 1 | -1; word: "Close" | "Open" } {
  const { closed, open } = profile.gripper;
  return Math.abs(value - closed) <= Math.abs(value - open)
    ? { direction: 1, word: "Close" }
    : { direction: -1, word: "Open" };
}

/** A finger that has travelled this far (signed along the asked direction) is judged; null waits for more. */
export function judgeFinger(travelled: number): GripperChip | null {
  if (Math.abs(travelled) <= MIN_FINGER_TRAVEL_RAD) return null;
  return travelled > 0 ? "moves" : "wrong-way";
}

/** The wrong way always fails; no travel is a WARN only where the robot names why its gripper may not answer. */
export function gripperGrade(chip: GripperChip, profile: MotionProfile): DriveVerdict["verdict"] {
  if (chip === "moves") return "pass";
  if (chip === "no-move" && profile.fingerMayStall) return "warn";
  return "fail";
}
