/**
 * What the cartesian_manager stack publishes, with the fields worth reading. Offered as suggestions where an
 * author types a topic or a field path; nothing is restricted to them.
 */
export type TopicSuggestion = { topic: string; messageType: string; fields: readonly string[] };

const XYZ = ["x", "y", "z"];
const twistFields = (prefix: string) => [
  ...XYZ.map((axis) => `${prefix}linear.${axis}`),
  ...XYZ.map((axis) => `${prefix}angular.${axis}`),
];

export const TOPIC_SUGGESTIONS: readonly TopicSuggestion[] = [
  {
    topic: "/ee_pose",
    messageType: "geometry_msgs/msg/PoseStamped",
    fields: [
      ...XYZ.map((axis) => `pose.position.${axis}`),
      ...["x", "y", "z", "w"].map((a) => `pose.orientation.${a}`),
    ],
  },
  { topic: "/ee_velocity", messageType: "geometry_msgs/msg/TwistStamped", fields: twistFields("twist.") },
  { topic: "/cartesian_command", messageType: "geometry_msgs/msg/TwistStamped", fields: twistFields("twist.") },
  {
    topic: "/joystick_cartesian_command",
    messageType: "geometry_msgs/msg/TwistStamped",
    fields: twistFields("twist."),
  },
  {
    topic: "/joint_states",
    messageType: "sensor_msgs/msg/JointState",
    fields: [0, 1, 2, 3, 4, 5, 6].flatMap((index) => [`position[${index}]`, `velocity[${index}]`]),
  },
  { topic: "/ee_jac", messageType: "std_msgs/msg/Float64MultiArray", fields: ["data", "manipulability"] },
  { topic: "/mode_request", messageType: "std_msgs/msg/String", fields: ["data"] },
  { topic: "/gripper_controller/commands", messageType: "std_msgs/msg/Float64MultiArray", fields: ["data[0]"] },
  {
    topic: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
    messageType: "std_msgs/msg/Float64",
    fields: ["data"],
  },
  {
    topic: "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed",
    messageType: "std_msgs/msg/Float64",
    fields: ["data"],
  },
  { topic: "/camera/color/image_raw/compressed", messageType: "sensor_msgs/msg/CompressedImage", fields: [] },
];

export function fieldSuggestionsFor(topic: unknown): readonly string[] {
  return TOPIC_SUGGESTIONS.find((suggestion) => suggestion.topic === topic)?.fields ?? [];
}

export function messageTypeSuggestionFor(topic: unknown): string | undefined {
  return TOPIC_SUGGESTIONS.find((suggestion) => suggestion.topic === topic)?.messageType;
}

/**
 * The message type a reader should carry after its topic changes. The old topic's type only goes when it was
 * that topic's known one (placed, not typed); the new topic's known type replaces it, or the backend reads it
 * from the graph. A type the author typed stays: a topic nobody publishes yet cannot be looked up.
 */
export function followTopicMessageType(
  previousTopic: unknown,
  nextTopic: unknown,
  messageType: unknown,
): string | undefined {
  const previousKnown = messageTypeSuggestionFor(previousTopic);
  const authored = typeof messageType === "string" && messageType !== "" && messageType !== previousKnown;
  if (authored) {
    return messageType as string;
  }
  return messageTypeSuggestionFor(nextTopic);
}
