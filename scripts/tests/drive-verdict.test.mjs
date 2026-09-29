import assert from "node:assert/strict";
import { test } from "node:test";
import { driveVerdict } from "../lib/drive-verdict.mjs";

const clean = {
  commandedAgainst: -0.07,
  commandedFollowed: true,
  drifted: false,
  known: false,
  maxJointGap: 0.01,
  measuredAgainst: -0.07,
  measuredFollowed: true,
  sagged: false,
  tolerance: 0.01,
  wireOk: true,
};
const gazebo = { ...clean, jointsMayLag: "the Gazebo arm rests on the ground plane" };

test("a gesture that follows on the wire, the command and the joints passes", () => {
  assert.equal(driveVerdict(clean).verdict, "pass");
  assert.equal(driveVerdict(gazebo).verdict, "pass");
});

test("Bloom's own direction is strict on every robot: a wrong wire or a command the wrong way fails", () => {
  for (const robot of [clean, gazebo]) {
    assert.equal(driveVerdict({ ...robot, wireOk: false }).verdict, "fail");
    assert.equal(driveVerdict({ ...robot, commandedAgainst: 0.05, commandedFollowed: false }).verdict, "fail");
    // A word named as unreliable is excused for straying, never for going the wrong way.
    assert.equal(
      driveVerdict({ ...robot, commandedAgainst: 0.05, commandedFollowed: false, known: true }).verdict,
      "fail",
    );
  }
});

test("mock hardware: a measured wrong sign, a sag or a lag fails", () => {
  assert.equal(driveVerdict({ ...clean, measuredAgainst: 0.043, measuredFollowed: false }).verdict, "fail");
  assert.equal(driveVerdict({ ...clean, sagged: true }).verdict, "fail");
  assert.equal(driveVerdict({ ...clean, drifted: true }).verdict, "fail");
  assert.equal(driveVerdict({ ...clean, measuredFollowed: false }).verdict, "fail");
});

test("Gazebo: a measured wrong sign is a WARN only while a joint is blocked short of its command", () => {
  // The run that asked for this rule: Up went 4.3 cm down with joint_3 0.28 rad short of its command.
  const blocked = driveVerdict({ ...gazebo, maxJointGap: 0.28, measuredAgainst: 0.043, measuredFollowed: false });
  assert.equal(blocked.verdict, "warn");
  assert.match(blocked.reasons.join(), /BLOCKED/);
  // The same wrong sign with every joint tracking its command is not the floor: it fails.
  const tracking = driveVerdict({ ...gazebo, maxJointGap: 0.05, measuredAgainst: 0.043, measuredFollowed: false });
  assert.equal(tracking.verdict, "fail");
});

test("Gazebo: a sag, a lag or a short measured motion is a WARN", () => {
  assert.equal(driveVerdict({ ...gazebo, sagged: true, maxJointGap: 0.26 }).verdict, "warn");
  assert.equal(driveVerdict({ ...gazebo, drifted: true }).verdict, "warn");
  assert.equal(driveVerdict({ ...gazebo, measuredFollowed: false }).verdict, "warn");
});
