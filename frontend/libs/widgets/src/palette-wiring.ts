/**
 * What a widget does the moment it is placed from the palette: the manager contract both arms share,
 * as the shipped apps use it. Only placement reads this; saved widgets keep the contract defaults.
 */
const EE_POSE = { topic: "/ee_pose", messageType: "geometry_msgs/msg/PoseStamped" };
const MODE_REQUEST = { topic: "/mode_request", messageType: "std_msgs/msg/String" };
const HAND_AXES = ["x", "y", "z"].map((axis) => ({
  ...{ topic: EE_POSE.topic, message_type: EE_POSE.messageType },
  field_path: `pose.position.${axis}`,
  label: `Hand ${axis}`,
  unit: "m",
  enabled: true,
}));

export const PALETTE_WIRING: Readonly<Record<string, { title: string; settings: Record<string, unknown> }>> = {
  "command-button": {
    title: "Neutral",
    settings: {
      ...MODE_REQUEST,
      action_label: "Request geometric/both",
      button_label: "Neutral",
      command: "geometric/both",
      payload: { data: "geometric/both" },
    },
  },
  // qontrol's own speed limit, on both arms; the manager normalizes its output and this sets the real speed.
  slider: {
    title: "Max linear speed",
    settings: {
      topic: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
      messageType: "std_msgs/msg/Float64",
      direction: "horizontal",
      max: 0.3,
      min: 0,
      step: 0.015,
      unit: "m/s",
      value: 0.15,
    },
  },
  // camera_interface publishes here on both arms, and the launcher starts it with Bloom.
  camera: { title: "Gripper camera", settings: { source: "ros-topic", topic: "/camera/color/image_raw/compressed" } },
  // Up to 1.5 m: the Kinova's hand sits near 1.2 m above its base, the Explorer's near 0.2 m.
  gauge: { title: "Hand height", settings: { ...EE_POSE, fieldPath: "pose.position.z", max: 1.5, min: 0, unit: "m" } },
  plot: { title: "Hand height", settings: { ...EE_POSE, fieldPath: "pose.position.z", unit: "m", samples: [] } },
  "topic-plot": { title: "Hand x", settings: { ...EE_POSE, fieldPath: "pose.position.x", unit: "m" } },
  "topic-echo": { title: "Hand pose", settings: { ...EE_POSE, fieldPath: "" } },
  "event-log": {
    title: "Mode requests",
    settings: { ...MODE_REQUEST, fieldPath: "data", entries: [], newest_first: true },
  },
  "plot-board": { title: "Hand position", settings: { series: HAND_AXES } },
  "value-strip": { title: "Hand position", settings: { series: HAND_AXES } },
};

const ARRIVES_AS_EXTRA: Readonly<Record<string, string>> = {
  joystick: "Translation pad",
  toggle: "Gripper open and close",
  "plot-picker": "Linked to this screen's plot board",
  "position-library": "Saved poses; going to one needs its export in the manager",
};

/** What a palette entry becomes when placed, in a few words, so the palette says it before the click does. */
export function paletteArrivesAs(kind: string): string | null {
  return PALETTE_WIRING[kind]?.title ?? ARRIVES_AS_EXTRA[kind] ?? null;
}
