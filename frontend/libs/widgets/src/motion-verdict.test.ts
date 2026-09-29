import { describe, expect, it } from "vitest";
import { gripperToggleSettings } from "./gripper";
import {
  BLOCKED_JOINT_RAD,
  driveChip,
  driveVerdict,
  gripperGrade,
  gripperWord,
  judgeFinger,
  MOTION_PROFILES,
  type MotionRobot,
  measureDrive,
} from "./motion-verdict";
import { rotationPadSettings, translationPadSettings } from "./robot-axes";

describe("the pinned wire words", () => {
  // The panel names a push by the wire it saw; the pads must put each word on the axis the profile pins.
  it.each(["explorer", "kinova"] as MotionRobot[])("match the %s pads' axis mapping", (robot) => {
    const axis = (settings: Record<string, unknown>, stick: "x" | "y") => {
      const mapping = (
        settings.runtime_binding as { axis_mapping: Record<string, { component: string; scale?: number }> }
      ).axis_mapping[stick];
      return `${mapping?.component.replace("_", ".")}${(mapping?.scale ?? 1) < 0 ? "-" : "+"}`;
    };
    const words = MOTION_PROFILES[robot].words;
    expect(axis(translationPadSettings(robot), "y")).toBe(words.Forward);
    expect(axis(translationPadSettings(robot), "x")).toBe(words.Right);
    expect(axis(rotationPadSettings(robot), "y")).toBe(words["Tilt up"]);
    expect(axis(rotationPadSettings(robot), "x")).toBe(words["Roll right"]);
  });

  it("share the gripper calibration the toggles send", () => {
    expect(gripperToggleSettings("explorer").onPayload).toBe(`{data: [${MOTION_PROFILES.explorer.gripper.closed}]}`);
    expect(gripperToggleSettings("kinova").offPayload).toBe(`{data: [${MOTION_PROFILES.kinova.gripper.open}]}`);
  });
});

describe("driveChip", () => {
  const verdict = (reasons: string[], grade: "fail" | "warn") => ({ reasons, verdict: grade });
  it("reads a pass as follows and any wrong sign as WRONG WAY", () => {
    expect(driveChip({ reasons: [], verdict: "pass" }, 0.5)).toBe("follows");
    expect(driveChip(verdict(["wire"], "fail"), 0)).toBe("wrong-way");
    expect(driveChip(verdict(["measured the wrong way"], "fail"), 0)).toBe("wrong-way");
  });
  it("reads a stall as blocked and a sag with the joints tracking as lags", () => {
    expect(driveChip(verdict(["BLOCKED: measured the wrong way"], "warn"), 0.3)).toBe("blocked");
    expect(driveChip(verdict(["command did not follow"], "fail"), 0)).toBe("blocked");
    expect(driveChip(verdict(["sagged"], "warn"), BLOCKED_JOINT_RAD)).toBe("lags");
    expect(driveChip(verdict(["sagged"], "warn"), BLOCKED_JOINT_RAD + 0.01)).toBe("blocked");
  });
});

describe("measureDrive", () => {
  const still = { orientation: { w: 1, x: 0, y: 0, z: 0 }, position: { x: 0.4, y: 0, z: 0.3 } };
  const moved = (dx: number) => ({ ...still, position: { ...still.position, x: 0.4 + dx } });
  const wire = { angular: { x: 0, y: 0, z: 0 }, linear: { x: -1, y: 0, z: 0 } };

  it("holds a known word's wire to its pinned axis", () => {
    const base = {
      end: moved(-0.06),
      endHand: moved(-0.06),
      profile: MOTION_PROFILES.explorer,
      start: still,
      startHand: still,
      wire,
    };
    expect(measureDrive({ ...base, word: "Forward" })?.verdict.verdict).toBe("pass");
    expect(measureDrive({ ...base, word: "Right" })?.row.wireOk).toBe(false);
    expect(measureDrive(base)?.word).toBe("Forward");
  });

  it("returns null for a wire that is not one Drive axis", () => {
    const mixed = { ...wire, linear: { x: -0.7, y: 0.7, z: 0 } };
    expect(measureDrive({ end: still, profile: MOTION_PROFILES.kinova, start: still, wire: mixed })).toBeNull();
  });

  it("keeps the verdict rules the simulation checks were tuned with", () => {
    const row = {
      commandedAgainst: -0.07,
      commandedFollowed: true,
      drifted: false,
      known: false,
      maxJointGap: 0.28,
      measuredAgainst: 0.043,
      measuredFollowed: false,
      sagged: false,
      tolerance: 0.01,
      wireOk: true,
    };
    expect(driveVerdict(row).verdict).toBe("fail");
    expect(driveVerdict({ ...row, jointsMayLag: MOTION_PROFILES.explorer.jointsMayLag }).verdict).toBe("warn");
  });
});

describe("the gripper rules", () => {
  it("names a command by the calibrated end it is nearer", () => {
    expect(gripperWord(1.1, MOTION_PROFILES.explorer)).toEqual({ direction: 1, word: "Close" });
    expect(gripperWord(0.2, MOTION_PROFILES.explorer)).toEqual({ direction: -1, word: "Open" });
    expect(gripperWord(0, MOTION_PROFILES.kinova).word).toBe("Open");
  });
  it("judges only past the travel threshold, and grades a stall by the robot", () => {
    expect(judgeFinger(0.2)).toBeNull();
    expect(judgeFinger(0.35)).toBe("moves");
    expect(judgeFinger(-0.35)).toBe("wrong-way");
    expect(gripperGrade("no-move", MOTION_PROFILES.explorer)).toBe("warn");
    expect(gripperGrade("no-move", MOTION_PROFILES.kinova)).toBe("fail");
    expect(gripperGrade("wrong-way", MOTION_PROFILES.explorer)).toBe("fail");
  });
});
