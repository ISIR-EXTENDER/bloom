import { describe, expect, it } from "vitest";
import {
  createMotionCheckState,
  type GripperLogEntry,
  isOperatorWarning,
  liveDrive,
  type MotionCheckState,
  type MotionStream,
  motionLogCsv,
  stepMotionCheck,
} from "./motion-check";
import { MOTION_PROFILES, type MotionRobot, wordForWire } from "./motion-verdict";
import { isWatchOnlyScreen } from "./widget-destination";

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };
const pose = (x: number, y: number, z: number) => ({ orientation: IDENTITY, position: { x, y, z } });
const stamped = (x: number, y: number, z: number) => ({ header: { frame_id: "base_link" }, pose: pose(x, y, z) });
const twist = (linear: Partial<Record<"x" | "y" | "z", number>>) => ({
  header: { frame_id: "base_link" },
  twist: { angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y: 0, z: 0, ...linear } },
});
const ARM = ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"];

/** Feeds samples in time order, as the runtime socket delivers them. */
function run(robot: MotionRobot, feed: (send: (stream: MotionStream, value: unknown, at: number) => void) => void) {
  let state: MotionCheckState = createMotionCheckState(robot);
  feed((stream, value, at) => {
    state = stepMotionCheck(state, stream, value, at);
  });
  return state;
}

/** A 1 s push along `wire`: /ee_pose moves by `commanded`, the tip by `measured`, dipping to `lowest` on the way. */
function push(
  robot: MotionRobot,
  options: {
    commanded: [number, number, number];
    finger?: string;
    jointGap?: number;
    lowest?: number;
    measured: [number, number, number];
    wire: Partial<Record<"x" | "y" | "z", number>>;
  },
) {
  const finger = options.finger ?? MOTION_PROFILES[robot].finger;
  const joints = (gap: number) => ({ name: [...ARM, finger], position: [0, gap > 0 ? 1 - gap : 1, 0, 0, 0, 0, 0.5] });
  return run(robot, (send) => {
    send("pose", stamped(0.4, 0, 0.3), 0);
    send("tip", { child_frame_id: "ft_frame", ...pose(0.4, 0, 0.3) }, 0);
    send("jointCommand", { data: [0, 1, 0, 0, 0, 0] }, 0);
    send("joints", joints(0), 0);
    for (let at = 100; at <= 1000; at += 100) {
      const share = at / 1000;
      send("twist", twist(options.wire), at);
      const [cx, cy, cz] = options.commanded;
      const [mx, my, mz] = options.measured;
      send("pose", stamped(0.4 + cx * share, cy * share, 0.3 + cz * share), at);
      const dip = options.lowest !== undefined && at === 500 ? options.lowest : 0.3 + mz * share;
      send("tip", pose(0.4 + mx * share, my * share, dip), at);
      send("joints", joints((options.jointGap ?? 0) * share), at);
    }
    send("twist", twist({}), 1050);
    for (let at = 1100; at <= 2000; at += 100) {
      send("joints", joints(options.jointGap ?? 0), at);
    }
  });
}

describe("Command vs motion: a Drive push", () => {
  it("follows on Kinova when the command and the tip both move along the word", () => {
    const state = push("kinova", { commanded: [0, 0.06, 0], measured: [0, 0.058, 0], wire: { y: 1 } });
    expect(state.log).toHaveLength(1);
    const [entry] = state.log;
    expect(entry).toMatchObject({
      chip: "follows",
      grade: "pass",
      kind: "drive",
      word: "Forward",
      wireAxis: "linear.y+",
    });
    expect(isOperatorWarning(entry as never)).toBe(false);
  });

  // The owner's first scenario: Forward on the Explorer, /ee_pose flat and clean, the measured hand dipping 3 cm.
  it("reads Forward with the hand dipping as a WARN on the Explorer: lags while the joints track, blocked past 0.1 rad", () => {
    const lagging = push("explorer", {
      commanded: [-0.06, 0, 0],
      jointGap: 0.05,
      lowest: 0.27,
      measured: [-0.05, 0, -0.005],
      wire: { x: -1 },
    });
    expect(lagging.log[0]).toMatchObject({ chip: "lags", grade: "warn", word: "Forward" });
    expect(lagging.log[0]?.kind === "drive" && lagging.log[0].dip).toBeCloseTo(0.03, 3);
    expect(lagging.log[0]?.kind === "drive" && lagging.log[0].reasons).toContain("sagged");

    const blocked = push("explorer", {
      commanded: [-0.06, 0, 0],
      jointGap: 0.28,
      lowest: 0.27,
      measured: [-0.05, 0, -0.005],
      wire: { x: -1 },
    });
    expect(blocked.log[0]).toMatchObject({ chip: "blocked", grade: "warn" });
    expect(blocked.log[0]?.kind === "drive" && blocked.log[0].shortJoints[0]).toMatchObject({ name: "joint_2" });
  });

  it("holds the same dip strictly on Kinova's mock hardware", () => {
    const state = push("kinova", {
      commanded: [0, 0.06, 0],
      lowest: 0.27,
      measured: [0, 0.05, -0.005],
      wire: { y: 1 },
    });
    expect(state.log[0]).toMatchObject({ chip: "lags", grade: "fail" });
  });

  it("calls a tip moving against the wire WRONG WAY, and a command against it too", () => {
    const joints = push("kinova", { commanded: [0, 0.06, 0], measured: [0, -0.04, 0], wire: { y: 1 } });
    expect(joints.log[0]).toMatchObject({ chip: "wrong-way", grade: "fail" });
    expect(isOperatorWarning(joints.log[0] as never)).toBe(true);
    const command = push("explorer", { commanded: [0.06, 0, 0], measured: [0.06, 0, 0], wire: { x: -1 } });
    expect(command.log[0]).toMatchObject({
      chip: "wrong-way",
      reasons: expect.arrayContaining(["commanded the wrong way"]),
    });
  });

  it("shows the push while it is held, and judges it only once the hand has settled", () => {
    let state = createMotionCheckState("kinova");
    state = stepMotionCheck(state, "pose", stamped(0.4, 0, 0.3), 0);
    state = stepMotionCheck(state, "tip", pose(0.4, 0, 0.3), 0);
    state = stepMotionCheck(state, "twist", twist({ y: 1 }), 100);
    state = stepMotionCheck(state, "pose", stamped(0.4, 0.04, 0.3), 500);
    state = stepMotionCheck(state, "tip", pose(0.4, 0.035, 0.3), 500);
    expect(liveDrive(state)).toMatchObject({ chip: "follows", wireAxis: "linear.y+" });
    expect(liveDrive(state)?.measured?.along).toBeCloseTo(1, 5);
    state = stepMotionCheck(state, "twist", twist({}), 600);
    state = stepMotionCheck(state, "tip", pose(0.4, 0.04, 0.3), 1000);
    expect(state.log).toHaveLength(0);
    state = stepMotionCheck(state, "tip", pose(0.4, 0.04, 0.3), 1400);
    expect(state.log).toHaveLength(1);
    expect(state.drive).toBeNull();
  });

  it("does not judge a twist on several axes at once", () => {
    const state = run("kinova", (send) => {
      send("pose", stamped(0.4, 0, 0.3), 0);
      send("twist", twist({ x: 0.7, y: 0.7 }), 100);
      send("twist", twist({}), 900);
      send("pose", stamped(0.5, 0.1, 0.3), 2000);
    });
    expect(state.mixed).toBe(true);
    expect(state.log).toHaveLength(0);
  });

  it("judges on /ee_pose alone and says so when no tip arrives", () => {
    const state = run("kinova", (send) => {
      send("pose", stamped(0.4, 0, 0.3), 0);
      send("twist", twist({ y: 1 }), 100);
      send("pose", stamped(0.4, 0.06, 0.3), 900);
      send("twist", twist({}), 950);
      send("pose", stamped(0.4, 0.06, 0.3), 2000);
    });
    expect(state.log[0]).toMatchObject({ chip: "follows", measured: null, reasons: ["no measured tip"] });
  });

  it("names each wire axis with the robot's own word", () => {
    expect(wordForWire(MOTION_PROFILES.explorer, "linear.x-")).toBe("Forward");
    expect(wordForWire(MOTION_PROFILES.explorer, "linear.x+")).toBe("Back");
    expect(wordForWire(MOTION_PROFILES.kinova, "angular.x-")).toBe("Roll left");
    expect(wordForWire(MOTION_PROFILES.kinova, "angular.z+")).toBe("Pivot left");
  });
});

function press(
  robot: MotionRobot,
  value: number,
  start: number,
  finger: (at: number) => number,
  until = 8000,
): MotionCheckState {
  const name = MOTION_PROFILES[robot].finger;
  return run(robot, (send) => {
    send("joints", { name: [name], position: [start] }, 0);
    send("gripper", { data: [value] }, 100);
    for (let at = 150; at <= until; at += 50) {
      send("joints", { name: [name], position: [finger(at - 100)] }, at);
    }
  });
}

describe("Command vs motion: a gripper press", () => {
  it("moves as asked, with the time it took to start and to arrive", () => {
    // Kinova Open: 0.8 -> 0.0 over a second, starting after 200 ms.
    const state = press("kinova", 0, 0.8, (t) => (t < 200 ? 0.8 : Math.max(0, 0.8 - (t - 200) / 1000)));
    const entry = state.log[0] as GripperLogEntry;
    expect(entry).toMatchObject({ chip: "moves", grade: "pass", value: 0, word: "Open" });
    expect(entry.startMs).toBeGreaterThanOrEqual(200);
    expect(entry.startMs).toBeLessThan(350);
    expect(entry.arriveMs).toBeGreaterThan(900);
    expect(entry.arriveMs).toBeLessThan(1100);
  });

  // The owner's second scenario: Open on the Explorer, the finger still for five seconds, then jumping open.
  it("reads Open with the finger not moving then jumping as did not move, and keeps the late jump", () => {
    const state = press("explorer", 0.2, 1.0, (t) => (t < 6000 ? 1.0 : 0.3));
    const entry = state.log[0] as GripperLogEntry;
    expect(entry).toMatchObject({ chip: "no-move", grade: "warn", word: "Open" });
    expect(entry.lateMoveMs).toBeGreaterThanOrEqual(6000);
    expect(entry.lateMoveMs).toBeLessThan(6100);
    expect(entry.startMs).toBe(entry.lateMoveMs);
    expect(isOperatorWarning(entry)).toBe(true);
    expect(state.gripper?.trace.at(-1)?.position).toBe(0.3);
  });

  it("fails a finger that does not move on a robot whose gripper always answers", () => {
    const state = press("kinova", 0.8, 0.0, () => 0.0);
    expect(state.log[0]).toMatchObject({ chip: "no-move", grade: "fail", word: "Close" });
  });

  it("calls a finger travelling against the word WRONG WAY", () => {
    const state = press("kinova", 0.8, 0.5, (t) => Math.max(0, 0.5 - t / 1000));
    expect(state.log[0]).toMatchObject({ chip: "wrong-way", grade: "fail", word: "Close" });
  });

  it("does not judge the same word again once the finger answered it", () => {
    const name = MOTION_PROFILES.kinova.finger;
    const state = run("kinova", (send) => {
      send("joints", { name: [name], position: [0.8] }, 0);
      send("gripper", { data: [0] }, 100);
      send("joints", { name: [name], position: [0] }, 600);
      send("gripper", { data: [0] }, 1000);
      send("joints", { name: [name], position: [0] }, 6000);
    });
    expect(state.log).toHaveLength(1);
  });
});

describe("the verdict log", () => {
  it("keeps the last 20 and exports them oldest first as CSV", () => {
    let state = createMotionCheckState("kinova");
    const name = MOTION_PROFILES.kinova.finger;
    for (let index = 0; index < 23; index += 1) {
      const at = index * 10000;
      state = stepMotionCheck(state, "joints", { name: [name], position: [0.8] }, at);
      state = stepMotionCheck(state, "gripper", { data: [0] }, at + 1);
      state = stepMotionCheck(state, "joints", { name: [name], position: [0.8] }, at + 5000);
    }
    expect(state.log).toHaveLength(20);
    const csv = motionLogCsv(state.log).trim().split("\n");
    expect(csv).toHaveLength(21);
    expect(csv[0]).toMatch(/^time,gesture,word,wire_axis,verdict,grade/);
    expect(csv[1]).toContain("gripper,Open,,did not move within 4 s,fail");
    expect(csv[1]?.startsWith(new Date(3 * 10000 + 5000).toISOString())).toBe(true);
  });

  it("writes a drive row with its axes, agreement and dip", () => {
    const state = push("explorer", {
      commanded: [-0.06, 0, 0],
      lowest: 0.27,
      measured: [-0.05, 0, -0.005],
      wire: { x: -1 },
    });
    const [, row] = motionLogCsv(state.log).trim().split("\n");
    expect(row).toContain(",drive,Forward,linear.x-,lags,warn,m,");
    expect(row).toContain(",3.0,");
  });
});

describe("a watch-only screen", () => {
  it("is one where nothing sends, so it stays readable beside the tablet in control", () => {
    const reading = { widgets: [{ kind: "motion-check" }, { kind: "topic-echo" }, { kind: "plot-board" }] };
    expect(isWatchOnlyScreen(reading)).toBe(true);
    expect(isWatchOnlyScreen({ widgets: [...reading.widgets, { kind: "toggle" }] })).toBe(false);
    expect(isWatchOnlyScreen({ widgets: [{ kind: "position-library" }] })).toBe(false);
  });
});
