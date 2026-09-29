/**
 * The verdict on one Drive or gripper gesture, shared with the Bloom Debug "Command vs motion" panel: the rules,
 * thresholds and per-robot words live in frontend/libs/widgets/src/motion-verdict.ts, which node loads directly.
 */
export {
  BLOCKED_JOINT_RAD,
  driveVerdict,
  FINGER_WAIT_MS,
  gripperGrade,
  jointGaps,
  judgeFinger,
  MAX_COMMAND_GAP_M,
  MAX_SAG_M,
  MIN_DISPLACEMENT_M,
  MIN_FINGER_TRAVEL_RAD,
  MIN_ROTATION_RAD,
  MOTION_PROFILES,
  measureDrive,
  rotationVector,
  SETTLE_MS,
} from "../../frontend/libs/widgets/src/motion-verdict.ts";
