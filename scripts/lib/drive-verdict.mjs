/**
 * The verdict on one Drive gesture in the simulation checks. Bloom's own direction (the wire, and the pose qontrol
 * commands from it) is held strictly on every robot. The arm's measured hand is held strictly where its joints are
 * the command (mock hardware); a robot naming why its joints may not follow (`jointsMayLag`) turns a sag or a lag
 * into a WARN, and a measured wrong sign too, but only while a joint is blocked (more than BLOCKED_JOINT_RAD short
 * of its command): a wrong sign with the joints tracking still fails.
 */
export const BLOCKED_JOINT_RAD = 0.1;

/**
 * @param {object} row
 * @param {boolean} row.wireOk the wire carries the word's own axis and sign
 * @param {number} row.commandedAgainst how far /ee_pose moved against the word (m or rad; <= 0 when it did not)
 * @param {boolean} row.commandedFollowed /ee_pose moved far enough and mostly along the word
 * @param {number} row.measuredAgainst how far the measured hand moved against the word
 * @param {boolean} row.measuredFollowed the measured hand moved far enough and mostly along the word
 * @param {boolean} row.sagged a horizontal push lowered the measured hand past the limit
 * @param {boolean} row.drifted the push left the measured hand further from the command than the limit
 * @param {number} row.maxJointGap the largest |command - joint| at the end of the push, in rad
 * @param {number} row.tolerance how far against the word counts as the wrong sign
 * @param {boolean} row.known the robot names this word as one that may not follow reliably
 * @param {string} [row.jointsMayLag] why this robot's joints may not follow their command
 * @returns {{ verdict: "pass" | "warn" | "fail", reasons: string[] }}
 */
export function driveVerdict(row) {
  const fail = [];
  const warn = [];
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
