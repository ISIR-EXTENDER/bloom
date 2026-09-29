import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import {
  type DriveChip,
  type DriveMeasure,
  type DriveVerdict,
  FINGER_WAIT_MS,
  type GripperChip,
  gripperGrade,
  gripperWord,
  isZeroTwist,
  type JointGap,
  jointGaps,
  judgeFinger,
  MOTION_PROFILES,
  type MotionProfile,
  type MotionRobot,
  measureDrive,
  type Pose,
  SETTLE_MS,
  SHORT_JOINT_RAD,
  type Twist,
  type Vector3,
  wireAxis,
  wireComponent,
} from "./motion-verdict";
import { robotFamily } from "./robot-family";
import { MOTION_CHECK_DEFAULT_SETTINGS } from "./settings/motion-check";
import { asRecord } from "./values";

/**
 * Command vs motion, sample by sample: each Drive push and gripper press is followed from the wire to /ee_pose and
 * the measured tip, and judged with the simulation checks' own rules (motion-verdict.ts) once the hand has settled.
 */

export const MOTION_LOG_LIMIT = 20;
/** The finger is traced this long after a gripper command, so a late jump still shows on the trace. */
export const FINGER_TRACE_MS = 10000;
const FINGER_TRACE_POINTS = 400;
/** The finger has started once it is this far from where it was; it has arrived once still this long. */
const FINGER_START_RAD = 0.02;
const FINGER_STILL_RAD = 0.005;
const FINGER_STILL_MS = 300;

export type MotionStream = "gripper" | "jointCommand" | "joints" | "pose" | "tip" | "twist";
export type MotionGrade = DriveVerdict["verdict"];

export type DriveLogEntry = {
  kind: "drive";
  id: number;
  /** When the hand was read, ms since the epoch. */
  at: number;
  chip: DriveChip;
  commanded: Vector3;
  commandedAlong: number;
  /** The measured hand's lowest point below its start while held, for a horizontal push (m). */
  dip: number;
  grade: MotionGrade;
  horizontal: boolean;
  measured: Vector3 | null;
  measuredAlong: number | null;
  reasons: readonly string[];
  shortJoints: readonly JointGap[];
  unit: "m" | "rad";
  wireAxis: string;
  word: string | null;
};

export type GripperLogEntry = {
  kind: "gripper";
  id: number;
  at: number;
  after: number | null;
  arriveMs: number | null;
  before: number | null;
  chip: GripperChip;
  finger: string;
  grade: MotionGrade;
  /** When a finger judged "did not move" travelled after all, ms after the command. */
  lateMoveMs: number | null;
  startMs: number | null;
  value: number;
  word: "Close" | "Open";
};

export type MotionLogEntry = DriveLogEntry | GripperLogEntry;

export type ActiveDrive = {
  /** The wire's one axis and sign, such as "linear.x-". */
  axis: string;
  lowestHandZ: number | null;
  releasedAt: number | null;
  start: Pose | null;
  startHand: Pose | null;
  startedAt: number;
  wire: Twist;
};

export type FingerPoint = { at: number; position: number };

export type ActiveGripper = {
  arriveMs: number | null;
  before: number | null;
  direction: 1 | -1;
  entryId: number | null;
  lastMoveAt: number | null;
  last: number | null;
  /** The same word the finger already answered: nothing to travel, so nothing is judged. */
  repeat: boolean;
  sentAt: number;
  startMs: number | null;
  trace: readonly FingerPoint[];
  value: number;
  word: "Close" | "Open";
};

export type MotionCheckState = {
  drive: ActiveDrive | null;
  gripper: ActiveGripper | null;
  jointCommand: readonly number[] | null;
  joints: { name: readonly string[]; position: readonly number[] } | null;
  lastAt: number;
  /** Newest first. */
  log: readonly MotionLogEntry[];
  /** The last non-zero wire held several axes at once, which no single word names. */
  mixed: boolean;
  nextId: number;
  pose: Pose | null;
  robot: MotionRobot;
  tip: Pose | null;
  tipFrame: string | null;
};

export function createMotionCheckState(robot: MotionRobot = "explorer"): MotionCheckState {
  return {
    drive: null,
    gripper: null,
    jointCommand: null,
    joints: null,
    lastAt: 0,
    log: [],
    mixed: false,
    nextId: 1,
    pose: null,
    robot,
    tip: null,
    tipFrame: null,
  };
}

export function motionProfile(state: Pick<MotionCheckState, "robot">): MotionProfile {
  return MOTION_PROFILES[state.robot] ?? MOTION_PROFILES.explorer;
}

/** One sample in; the same state object back when it changed nothing. */
export function stepMotionCheck(
  state: MotionCheckState,
  stream: MotionStream,
  value: unknown,
  at: number,
): MotionCheckState {
  let next: MotionCheckState = { ...state, lastAt: Math.max(state.lastAt, at) };
  switch (stream) {
    case "pose": {
      const pose = readPose(asRecord(value).pose ?? value);
      if (!pose) return state;
      next.pose = pose;
      break;
    }
    case "tip": {
      const pose = readPose(value);
      if (!pose) return state;
      next.tip = pose;
      next.tipFrame = readFrame(value) ?? next.tipFrame;
      if (next.drive) {
        const lowest = next.drive.lowestHandZ;
        next.drive = {
          ...next.drive,
          lowestHandZ: lowest === null ? pose.position.z : Math.min(lowest, pose.position.z),
        };
        if (!next.drive.startHand) next.drive = { ...next.drive, startHand: pose, lowestHandZ: pose.position.z };
      }
      break;
    }
    case "joints": {
      const joints = readJoints(value);
      if (!joints) return state;
      next.joints = joints;
      next = traceFinger(next, at);
      break;
    }
    case "jointCommand": {
      const data = readNumbers(asRecord(value).data);
      if (!data) return state;
      next.jointCommand = data;
      break;
    }
    case "twist": {
      const wire = readTwist(value);
      if (!wire) return state;
      next = stepWire(next, wire, at);
      break;
    }
    case "gripper": {
      const data = readNumbers(asRecord(value).data);
      if (!data || data.length === 0) return state;
      next = startGripper(next, data[0] as number, at);
      break;
    }
  }
  return settle(next, at);
}

/** The push in progress, measured against the latest readings; null when no single-axis push is held or settling. */
export function liveDrive(state: MotionCheckState): DriveMeasure | null {
  const drive = state.drive;
  if (!drive?.start || !state.pose) return null;
  return measureDrive({
    end: state.pose,
    endHand: drive.startHand ? state.tip : null,
    gaps: jointGaps(state.jointCommand ?? undefined, state.joints ?? undefined),
    lowestHandZ: drive.lowestHandZ ?? undefined,
    profile: motionProfile(state),
    start: drive.start,
    startHand: drive.startHand,
    wire: drive.wire,
  });
}

/** The joints short of their command right now, by more than SHORT_JOINT_RAD. */
export function shortJoints(state: Pick<MotionCheckState, "jointCommand" | "joints">): JointGap[] {
  return jointGaps(state.jointCommand ?? undefined, state.joints ?? undefined).filter(
    (row) => Math.abs(row.gap) > SHORT_JOINT_RAD,
  );
}

export function fingerPosition(state: Pick<MotionCheckState, "joints" | "robot">): number | null {
  const joints = state.joints;
  if (!joints) return null;
  const at = joints.name.indexOf(motionProfile(state).finger);
  const position = at < 0 ? undefined : joints.position[at];
  return typeof position === "number" && Number.isFinite(position) ? position : null;
}

function stepWire(state: MotionCheckState, wire: Twist, at: number): MotionCheckState {
  let next = state;
  if (isZeroTwist(wire)) {
    return next.drive && next.drive.releasedAt === null ? { ...next, drive: { ...next.drive, releasedAt: at } } : next;
  }
  const component = wireComponent(wire);
  if (!component) {
    next = next.drive ? finishDrive(next, at) : next;
    return { ...next, drive: null, mixed: true };
  }
  const drive = next.drive;
  if (drive) {
    if (drive.releasedAt !== null || drive.axis !== wireAxis(component)) {
      next = finishDrive(next, at);
    } else {
      return { ...next, drive: { ...drive, wire }, mixed: false };
    }
  }
  return {
    ...next,
    drive: {
      axis: wireAxis(component),
      lowestHandZ: next.tip ? next.tip.position.z : null,
      releasedAt: null,
      start: next.pose,
      startHand: next.tip,
      startedAt: at,
      wire,
    },
    mixed: false,
  };
}

function finishDrive(state: MotionCheckState, at: number): MotionCheckState {
  const measure = liveDrive(state);
  if (!measure) return { ...state, drive: null };
  const entry: DriveLogEntry = {
    at,
    chip: measure.chip,
    commanded: measure.commanded.moved,
    commandedAlong: measure.commanded.along,
    dip: measure.dip,
    grade: measure.verdict.verdict,
    horizontal: measure.horizontal,
    id: state.nextId,
    kind: "drive",
    measured: measure.measured?.moved ?? null,
    measuredAlong: measure.measured?.along ?? null,
    reasons: measure.measured ? measure.verdict.reasons : [...measure.verdict.reasons, "no measured tip"],
    shortJoints: shortJoints(state),
    unit: measure.unit,
    wireAxis: measure.wireAxis,
    word: measure.word,
  };
  return { ...state, drive: null, log: pushLog(state.log, entry), nextId: state.nextId + 1 };
}

function startGripper(state: MotionCheckState, value: number, at: number): MotionCheckState {
  if (!Number.isFinite(value)) return state;
  const { direction, word } = gripperWord(value, motionProfile(state));
  const previous = state.gripper;
  // The same word again, after the finger answered it: the hand is already there.
  const answered = previous?.entryId
    ? state.log.find((entry) => entry.id === previous.entryId && entry.kind === "gripper" && entry.chip === "moves")
    : undefined;
  const repeat = Boolean(answered) && previous?.word === word;
  const before = fingerPosition(state);
  return {
    ...state,
    gripper: {
      arriveMs: null,
      before,
      direction,
      entryId: null,
      last: before,
      lastMoveAt: null,
      repeat,
      sentAt: at,
      startMs: null,
      trace: before === null ? [] : [{ at: 0, position: before }],
      value,
      word,
    },
  };
}

function traceFinger(state: MotionCheckState, at: number): MotionCheckState {
  const gripper = state.gripper;
  const position = fingerPosition(state);
  if (!gripper || position === null) return state;
  const since = at - gripper.sentAt;
  if (since < 0 || since > FINGER_TRACE_MS) return state;
  const before = gripper.before ?? position;
  const next: ActiveGripper = {
    ...gripper,
    before,
    last: position,
    trace: gripper.trace.length >= FINGER_TRACE_POINTS ? gripper.trace : [...gripper.trace, { at: since, position }],
  };
  if (gripper.last !== null && Math.abs(position - gripper.last) > FINGER_STILL_RAD) next.lastMoveAt = at;
  if (next.startMs === null && Math.abs(position - before) > FINGER_START_RAD) next.startMs = since;
  if (
    next.startMs !== null &&
    next.arriveMs === null &&
    next.lastMoveAt !== null &&
    at - next.lastMoveAt >= FINGER_STILL_MS
  ) {
    next.arriveMs = next.lastMoveAt - gripper.sentAt;
  }
  let result: MotionCheckState = { ...state, gripper: next };
  if (next.repeat) return result;
  const judged = judgeFinger(next.direction * (position - before));
  if (next.entryId === null && judged && since <= FINGER_WAIT_MS) {
    result = judgeGripper(result, judged, at);
  } else if (next.entryId !== null) {
    result = updateGripperEntry(result, (entry) => ({
      ...entry,
      after: position,
      arriveMs: next.arriveMs,
      lateMoveMs: entry.chip === "no-move" && entry.lateMoveMs === null && judged ? since : entry.lateMoveMs,
      startMs: next.startMs,
    }));
  }
  return result;
}

function judgeGripper(state: MotionCheckState, chip: GripperChip, at: number): MotionCheckState {
  const gripper = state.gripper as ActiveGripper;
  const entry: GripperLogEntry = {
    after: gripper.last,
    arriveMs: gripper.arriveMs,
    at,
    before: gripper.before,
    chip,
    finger: motionProfile(state).finger,
    grade: gripperGrade(chip, motionProfile(state)),
    id: state.nextId,
    kind: "gripper",
    lateMoveMs: null,
    startMs: gripper.startMs,
    value: gripper.value,
    word: gripper.word,
  };
  return {
    ...state,
    gripper: { ...gripper, entryId: entry.id },
    log: pushLog(state.log, entry),
    nextId: state.nextId + 1,
  };
}

function updateGripperEntry(
  state: MotionCheckState,
  update: (entry: GripperLogEntry) => GripperLogEntry,
): MotionCheckState {
  const id = state.gripper?.entryId;
  const index = state.log.findIndex((entry) => entry.id === id);
  const entry = state.log[index];
  if (index < 0 || entry?.kind !== "gripper") return state;
  const updated = update(entry);
  if (
    updated.after === entry.after &&
    updated.arriveMs === entry.arriveMs &&
    updated.lateMoveMs === entry.lateMoveMs &&
    updated.startMs === entry.startMs
  ) {
    return state;
  }
  const log = [...state.log];
  log[index] = updated;
  return { ...state, log };
}

/** Time passes on every stream: a released push is read once settled, and a finger that never moved is judged. */
function settle(state: MotionCheckState, at: number): MotionCheckState {
  let next = state;
  if (next.drive?.releasedAt != null && at - next.drive.releasedAt >= SETTLE_MS) {
    next = finishDrive(next, at);
  }
  const gripper = next.gripper;
  if (
    gripper &&
    gripper.entryId === null &&
    !gripper.repeat &&
    gripper.before !== null &&
    at - gripper.sentAt > FINGER_WAIT_MS
  ) {
    next = judgeGripper(next, "no-move", at);
  }
  return next;
}

function pushLog(log: readonly MotionLogEntry[], entry: MotionLogEntry): MotionLogEntry[] {
  return [entry, ...log].slice(0, MOTION_LOG_LIMIT);
}

/** Whether an entry is one the operator hears about: the hand went the wrong way, or the gripper never moved. */
export function isOperatorWarning(entry: MotionLogEntry): boolean {
  return entry.chip === "wrong-way" || entry.chip === "no-move";
}

const CSV_COLUMNS = [
  "time",
  "gesture",
  "word",
  "wire_axis",
  "verdict",
  "grade",
  "unit",
  "commanded",
  "commanded_along_pct",
  "measured",
  "measured_along_pct",
  "dip_cm",
  "short_joints",
  "gripper_value",
  "finger",
  "finger_before",
  "finger_after",
  "start_ms",
  "arrive_ms",
  "late_move_ms",
  "reasons",
] as const;

export const DRIVE_CHIP_WORDS: Readonly<Record<DriveChip, string>> = {
  blocked: "blocked",
  follows: "follows",
  lags: "lags",
  "wrong-way": "WRONG WAY",
};

export const GRIPPER_CHIP_WORDS: Readonly<Record<GripperChip, string>> = {
  moves: "moves as asked",
  "no-move": `did not move within ${FINGER_WAIT_MS / 1000} s`,
  "wrong-way": "WRONG WAY",
};

/** The log for the bench: oldest first, one row per verdict. */
export function motionLogCsv(log: readonly MotionLogEntry[]): string {
  const vector = (v: Vector3 | null) => (v ? `${fixed(v.x)} ${fixed(v.y)} ${fixed(v.z)}` : "");
  const percent = (value: number | null) => (value === null ? "" : Math.round(value * 100).toString());
  const optional = (value: number | null) => (value === null ? "" : Math.round(value).toString());
  const rows = [...log].reverse().map((entry) => {
    const time = new Date(entry.at).toISOString();
    if (entry.kind === "drive") {
      return [
        time,
        "drive",
        entry.word ?? "",
        entry.wireAxis,
        DRIVE_CHIP_WORDS[entry.chip],
        entry.grade,
        entry.unit,
        vector(entry.commanded),
        percent(entry.commandedAlong),
        vector(entry.measured),
        percent(entry.measuredAlong),
        entry.horizontal ? (entry.dip * 100).toFixed(1) : "",
        entry.shortJoints.map((row) => `${row.name} ${row.gap.toFixed(2)}`).join("; "),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        entry.reasons.join("; "),
      ];
    }
    return [
      time,
      "gripper",
      entry.word,
      "",
      GRIPPER_CHIP_WORDS[entry.chip],
      entry.grade,
      "rad",
      "",
      "",
      "",
      "",
      "",
      "",
      entry.value.toString(),
      entry.finger,
      entry.before === null ? "" : fixed(entry.before),
      entry.after === null ? "" : fixed(entry.after),
      optional(entry.startMs),
      optional(entry.arriveMs),
      optional(entry.lateMoveMs),
      "",
    ];
  });
  return `${[CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function fixed(value: number): string {
  return value.toFixed(4);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function readVector(value: unknown): Vector3 | null {
  const record = asRecord(value);
  const x = Number(record.x);
  const y = Number(record.y);
  const z = Number(record.z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function readPose(value: unknown): Pose | null {
  const record = asRecord(value);
  const position = readVector(record.position);
  const orientation = asRecord(record.orientation);
  const w = Number(orientation.w);
  const rest = readVector(orientation);
  if (!position || !rest || !Number.isFinite(w)) return null;
  return { orientation: { ...rest, w }, position };
}

function readFrame(value: unknown): string | null {
  const frame = asRecord(value).child_frame_id;
  return typeof frame === "string" && frame.length > 0 ? frame : null;
}

function readTwist(value: unknown): Twist | null {
  const record = asRecord(value);
  const twist = "twist" in record ? asRecord(record.twist) : record;
  const linear = readVector(twist.linear);
  const angular = readVector(twist.angular);
  return linear && angular ? { angular, linear } : null;
}

function readNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function readJoints(value: unknown): { name: string[]; position: number[] } | null {
  const record = asRecord(value);
  if (!Array.isArray(record.name) || !Array.isArray(record.position)) return null;
  return { name: record.name.map(String), position: record.position.map(Number) };
}

/** The hidden panel a screen reads through when the operator's motion cue is on and it has no panel of its own. */
export const MOTION_WATCH_WIDGET_ID = "__motion-watch";

/** A screen's Command vs motion panels judge by the rules of the robot this Bloom drives, unless one names its own. */
export function withMotionCheckRobot(screen: ScreenConfig, robotName?: string | null): ScreenConfig {
  const family = robotFamily(robotName);
  if (!family || !screen.widgets.some((widget) => widget.kind === "motion-check" && isAuto(widget))) {
    return screen;
  }
  return {
    ...screen,
    widgets: screen.widgets.map((widget) =>
      widget.kind === "motion-check" && isAuto(widget)
        ? { ...widget, settings: { ...widget.settings, robot: family } }
        : widget,
    ),
  };
}

/** The panel whose verdicts the operator cue follows: the screen's own, or the hidden watch. */
export function motionWatchWidgetId(screen: ScreenConfig): string {
  return screen.widgets.find((widget) => widget.kind === "motion-check")?.id ?? MOTION_WATCH_WIDGET_ID;
}

/**
 * The screen the runtime reads data for. With the cue on and no panel on the screen, a hidden one is added: it is
 * subscribed and judged like any panel, and never drawn, since only the data screen carries it.
 */
export function withMotionWatch(screen: ScreenConfig, enabled: boolean, robotName?: string | null): ScreenConfig {
  if (!enabled || screen.widgets.some((widget) => widget.kind === "motion-check")) {
    return screen;
  }
  const watch: WidgetConfig = {
    id: MOTION_WATCH_WIDGET_ID,
    kind: "motion-check",
    layout: { height: 0, width: 0, x: 0, y: 0 },
    settings: { ...MOTION_CHECK_DEFAULT_SETTINGS, robot: robotFamily(robotName) ?? "auto" },
    title: "",
  };
  return { ...screen, widgets: [...screen.widgets, watch] };
}

function isAuto(widget: WidgetConfig): boolean {
  return widget.settings.robot === undefined || widget.settings.robot === "auto" || widget.settings.robot === "";
}
