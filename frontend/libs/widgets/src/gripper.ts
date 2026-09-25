import { type RobotFamily, robotFamily } from "./robot-family";
import type { ToggleSettings } from "./settings";

/**
 * The gripper command, in one place.
 *
 * `cartesian_manager` leaves the gripper to its own controller: a `Float64MultiArray` on
 * `/gripper_controller/commands`, the same contract `tablet_interface` publishes. The two arms travel
 * different distances, so the pair of numbers is per robot and nothing else about the command changes.
 */
const GRIPPER_COMMAND_TOPIC = "/gripper_controller/commands";
const GRIPPER_MESSAGE_TYPE = "std_msgs/msg/Float64MultiArray";

type GripperCalibration = { closed: number; open: number };

/** Explorer matches tablet_interface; the Kinova pair is the Robotiq 85 knuckle joint's own range. */
const GRIPPER_CALIBRATIONS: Readonly<Record<RobotFamily, GripperCalibration>> = {
  explorer: { closed: 1.1, open: 0.2 },
  kinova: { closed: 0.8, open: 0.0 },
};

function gripperCalibrationFor(robotName: string | undefined): GripperCalibration {
  return GRIPPER_CALIBRATIONS[robotFamily(robotName) ?? "explorer"];
}

/**
 * A toggle that drives the gripper without the author writing anything.
 *
 * The labels name what the press will do and the state labels name what was commanded, which is the
 * rule the operator glossary and the shipped seeds already follow.
 */
export function gripperToggleSettings(robotName?: string): ToggleSettings {
  const calibration = gripperCalibrationFor(robotName);
  return {
    initialValue: false,
    messageType: GRIPPER_MESSAGE_TYPE,
    // On is the closed state: pressing "Close gripper" turns it on and commands the closed value, as the Manager seeds do.
    offLabel: "Close gripper",
    offPayload: `{data: [${calibration.open}]}`,
    offStateLabel: "open",
    onLabel: "Open gripper",
    onPayload: `{data: [${calibration.closed}]}`,
    onStateLabel: "closed",
    show_details: false,
    topic: GRIPPER_COMMAND_TOPIC,
  } as ToggleSettings;
}
