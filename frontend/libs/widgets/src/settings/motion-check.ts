import { createContract, fail, succeed, validateBoolean, validateOneOf, validateString } from "./validation";

export type MotionCheckSettings = {
  /** The Drive wire: what the controls sent the manager. */
  topic: string;
  messageType: string;
  /** qontrol's commanded hand. */
  poseTopic: string;
  /** The measured tip: the backend's TF lookup of qontrol's tip_frame, streamed on this topic. */
  tipTopic: string;
  jointStateTopic: string;
  /** qontrol's joint command: a joint far short of it is blocked. */
  jointCommandTopic: string;
  gripperTopic: string;
  /** Whose words, finger and leniency judge the motion; "auto" follows the robot this Bloom drives. */
  robot: "auto" | "explorer" | "kinova";
  hide_title?: boolean;
  show_details: boolean;
};

/** The field path that asks the backend for the tip through TF rather than the raw /tf stream. */
export const MOTION_TIP_FIELD_PATH = "tip_pose";

export const MOTION_CHECK_DEFAULT_SETTINGS: MotionCheckSettings = {
  gripperTopic: "/gripper_controller/commands",
  jointCommandTopic: "/qontrol_controller/commands",
  jointStateTopic: "/joint_states",
  messageType: "geometry_msgs/msg/TwistStamped",
  poseTopic: "/ee_pose",
  robot: "auto",
  show_details: false,
  tipTopic: "/tf",
  topic: "/joystick_cartesian_command",
};

export const motionCheckContract = createContract(
  "motion-check",
  [
    { key: "topic", label: "Drive wire (geometry_msgs/msg/TwistStamped)", type: "text", required: true },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "poseTopic", label: "Commanded hand (geometry_msgs/msg/PoseStamped)", type: "text", required: true },
    { key: "tipTopic", label: "Measured tip (TF, looked up by the backend)", type: "text", required: true },
    { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
    { key: "jointCommandTopic", label: "Joint command (std_msgs/msg/Float64MultiArray)", type: "text", required: true },
    { key: "gripperTopic", label: "Gripper command (std_msgs/msg/Float64MultiArray)", type: "text", required: true },
    {
      key: "robot",
      label: "Robot rules",
      type: "select",
      required: false,
      options: ["auto", "explorer", "kinova"],
    },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  MOTION_CHECK_DEFAULT_SETTINGS,
  (settings) => {
    const errors = [
      ...["topic", "poseTopic", "tipTopic", "jointStateTopic", "jointCommandTopic", "gripperTopic"].flatMap((key) =>
        validateString(settings, key),
      ),
      ...(settings.robot === undefined ? [] : validateOneOf(settings, "robot", ["auto", "explorer", "kinova"])),
      ...validateBoolean(settings, "show_details"),
    ];
    return errors.length > 0 ? fail(errors) : succeed(settings as MotionCheckSettings);
  },
);
