import { robotFamily } from "../robot-family";
import type { ToggleSettings } from "./toggle";

export type RosMessageTogglePreset = {
  id: string;
  label: string;
  description: string;
  messageType: string;
  onPayload: string;
  offPayload: string;
};

export type RosMessageCommandPreset = {
  id: string;
  label: string;
  description: string;
  buttonLabel: string;
  category: "bridge" | "motion" | "state-machine" | "utility";
  command: string;
  messageType: string;
  payload: string;
  topic: string;
};

export const ROS_MESSAGE_TOGGLE_PRESETS: readonly RosMessageTogglePreset[] = [
  {
    id: "bool",
    label: "Bool true / false",
    description: "Publish a standard ROS bool for ON and OFF.",
    messageType: "std_msgs/msg/Bool",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
  },
  {
    id: "float64",
    label: "Float64 1 / 0",
    description: "Publish numeric ON/OFF values for simple bridge topics.",
    messageType: "std_msgs/msg/Float64",
    onPayload: "{data: 1.0}",
    offPayload: "{data: 0.0}",
  },
  {
    id: "int32",
    label: "Int32 1 / 0",
    description: "Publish integer ON/OFF values when the subscriber expects Int32.",
    messageType: "std_msgs/msg/Int32",
    onPayload: "{data: 1}",
    offPayload: "{data: 0}",
  },
  {
    id: "string-on-off",
    label: "String on / off",
    description: "Send text commands while keeping the ON/OFF interaction.",
    messageType: "std_msgs/msg/String",
    onPayload: "{data: 'on'}",
    offPayload: "{data: 'off'}",
  },
  {
    id: "state-machine",
    label: "State machine commands",
    description: "Example for toggling between two state machine commands.",
    messageType: "std_msgs/msg/String",
    onPayload: "{data: 'activate_throw'}",
    offPayload: "{data: 'teleop'}",
  },
  {
    id: "digital-output-array",
    label: "Digital output array",
    description: "Useful for bridges that expect [pin, state].",
    messageType: "std_msgs/msg/Int32MultiArray",
    onPayload: "{data: [13, 1]}",
    offPayload: "{data: [13, 0]}",
  },
  {
    id: "vector3",
    label: "Vector3 mapping",
    description: "Example of a structured payload with named ROS fields.",
    messageType: "geometry_msgs/msg/Vector3",
    onPayload: "{x: 0.1, y: 0.0, z: 0.0}",
    offPayload: "{x: 0.0, y: 0.0, z: 0.0}",
  },
];

export const ROS_MESSAGE_COMMAND_PRESETS: readonly RosMessageCommandPreset[] = [
  {
    id: "state-machine-activate-throw",
    label: "State machine command",
    description: "Publish one string command to the Petanque state machine; only that stack reads it.",
    buttonLabel: "Activate throw",
    category: "state-machine",
    command: "activate_throw",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'activate_throw'}",
    topic: "/petanque_state_machine/change_state",
  },
  {
    id: "trigger-bool",
    label: "Trigger action",
    description: "A one-shot boolean under /ui/, which the deployment allows; point it at the topic your node reads.",
    buttonLabel: "Trigger",
    category: "utility",
    command: "trigger",
    messageType: "std_msgs/msg/Bool",
    payload: "{data: true}",
    topic: "/ui/trigger",
  },
  {
    id: "digital-output-on",
    label: "Digital output ON",
    description: "Publish a structured array payload for an Arduino-style digital output bridge.",
    buttonLabel: "Pin ON",
    category: "bridge",
    command: "digital_output_on",
    messageType: "std_msgs/msg/Int32MultiArray",
    payload: "{data: [13, 1]}",
    topic: "/ui/ros_toggle",
  },
  {
    id: "manager-neutral",
    label: "Manager neutral",
    description: "Both shapers off: the twist goes through as sent (geometric/both), as the Manager apps' Neutral.",
    buttonLabel: "Neutral",
    category: "motion",
    command: "geometric/both",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'geometric/both'}",
    topic: "/mode_request",
  },
  {
    id: "manager-snake",
    label: "Manager snake",
    description: "The snake shaper: the tool leads and the arm follows (geometric/snake).",
    buttonLabel: "Snake",
    category: "motion",
    command: "geometric/snake",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'geometric/snake'}",
    topic: "/mode_request",
  },
  {
    id: "manager-joint-target-home",
    label: "Manager joint target",
    description: "Request a joint target the manager loaded at start (behaviour/joint_target/<name>).",
    buttonLabel: "Send Home",
    category: "motion",
    command: "behaviour/joint_target/home",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'behaviour/joint_target/home'}",
    topic: "/mode_request",
  },
  {
    id: "manager-cancel-behaviour",
    label: "Cancel manager behaviour",
    description: "Return the manager to passthrough, cancelling an in-progress joint target.",
    buttonLabel: "Cancel motion",
    category: "motion",
    command: "behaviour/passthrough",
    messageType: "std_msgs/msg/String",
    payload: "{data: 'behaviour/passthrough'}",
    topic: "/mode_request",
  },
];

/** Go home is left out on the Kinova while cartesian_manager#10 is open, as in `commandPurposesFor`. */
export function getRosMessageCommandPresetsByCategory(
  robotName?: string | null,
): ReadonlyMap<RosMessageCommandPreset["category"], readonly RosMessageCommandPreset[]> {
  const groups = new Map<RosMessageCommandPreset["category"], RosMessageCommandPreset[]>();
  const hidden = robotFamily(robotName) === "kinova" ? "manager-joint-target-home" : undefined;
  for (const preset of ROS_MESSAGE_COMMAND_PRESETS.filter((candidate) => candidate.id !== hidden)) {
    groups.set(preset.category, [...(groups.get(preset.category) ?? []), preset]);
  }
  return groups;
}

/**
 * The payload pair a toggle gets when its message type changes.
 *
 * Reads the preset table rather than repeating it. The two used to be written out separately and
 * agreed by hand, which is one edit away from a toggle that publishes the wrong thing.
 */
export function getDefaultRosMessageTogglePayloads(
  messageType: string,
): Pick<ToggleSettings, "offPayload" | "onPayload"> {
  const normalizedType = messageType.trim().toLowerCase();
  const preset = ROS_MESSAGE_TOGGLE_PRESETS.find((candidate) => candidate.messageType.toLowerCase() === normalizedType);
  if (preset) {
    return { onPayload: preset.onPayload, offPayload: preset.offPayload };
  }
  // Uint8MultiArray carries the same digital-output shape as Int32MultiArray, and is not a preset
  // of its own because nothing offers it as a choice.
  if (normalizedType === "std_msgs/msg/uint8multiarray") {
    return { onPayload: "{data: [13, 1]}", offPayload: "{data: [13, 0]}" };
  }
  return { onPayload: "{data: 1.0}", offPayload: "{data: 0.0}" };
}
