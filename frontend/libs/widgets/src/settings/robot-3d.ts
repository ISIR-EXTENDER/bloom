import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type Robot3dSettings = {
  hide_title?: boolean;
  description: string;
  eeLink: string;
  frameAxes?: boolean;
  /** A PoseArray drawn as small triads: the shared-control goals, in the frame the header names. */
  goalsTopic?: string;
  jointStateTopic: string;
  markerTopic: string;
  /** Accepted from older screens and ignored: the view draws the API's robot, not a file. */
  modelSource?: "extension" | "urdf-url";
  /** A PoseStamped drawn as a triad in its frame: the manager's `/ee_pose` beside the model's tool shows whether the frames agree. */
  poseTopic?: string;
  robotModelUrl?: string;
  showAxes: boolean;
  /** A PoseStamped drawn as the larger, distinct marker: the manager's confidence-weighted soft goal. */
  softGoalTopic?: string;
  /** A JointState drawn as a translucent copy of the robot: where a joint target is sending it. */
  targetJointTopic?: string;
};

export const ROBOT_3D_DEFAULT_SETTINGS: Robot3dSettings = {
  description: "",
  eeLink: "",
  jointStateTopic: "/joint_states",
  markerTopic: "",
  poseTopic: "",
  showAxes: true,
  targetJointTopic: "/joint_target_command",
};

export const robot3dContract = createContract(
  "robot-3d",
  [
    { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
    { key: "markerTopic", label: "Marker topic (visualization_msgs/msg/MarkerArray)", type: "text", required: false },
    {
      key: "targetJointTopic",
      label: "Joint target topic (sensor_msgs/msg/JointState)",
      type: "text",
      required: false,
    },
    { key: "poseTopic", label: "Pose topic (geometry_msgs/msg/PoseStamped)", type: "text", required: false },
    { key: "goalsTopic", label: "Goals topic (geometry_msgs/msg/PoseArray)", type: "text", required: false },
    { key: "softGoalTopic", label: "Soft goal topic (geometry_msgs/msg/PoseStamped)", type: "text", required: false },
    { key: "eeLink", label: "Tool link for the axes", type: "text", required: false },
    { key: "showAxes", label: "Show the tool axes", type: "boolean", required: true },
    { key: "frameAxes", label: "Show every link frame", type: "boolean", required: false },
    { key: "description", label: "Description", type: "text", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
  ],
  ROBOT_3D_DEFAULT_SETTINGS,
  validateRobot3dSettings,
);

function validateRobot3dSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<Robot3dSettings> {
  const errors = [
    ...(settings.modelSource === undefined ? [] : validateOneOf(settings, "modelSource", ["extension", "urdf-url"])),
    ...(settings.robotModelUrl === undefined ? [] : validateString(settings, "robotModelUrl", { allowEmpty: true })),
    ...validateString(settings, "jointStateTopic"),
    ...validateString(settings, "markerTopic", { allowEmpty: true }),
    ...(settings.targetJointTopic === undefined
      ? []
      : validateString(settings, "targetJointTopic", { allowEmpty: true })),
    ...(settings.poseTopic === undefined ? [] : validateString(settings, "poseTopic", { allowEmpty: true })),
    ...(settings.goalsTopic === undefined ? [] : validateString(settings, "goalsTopic", { allowEmpty: true })),
    ...(settings.softGoalTopic === undefined ? [] : validateString(settings, "softGoalTopic", { allowEmpty: true })),
    ...validateString(settings, "eeLink", { allowEmpty: true }),
    ...validateBoolean(settings, "showAxes"),
    ...(settings.frameAxes === undefined ? [] : validateBoolean(settings, "frameAxes")),
    ...validateString(settings, "description", { allowEmpty: true }),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as Robot3dSettings);
}
