import { createContract, fail, succeed, validateBoolean, validateString } from "./validation";

export type JointTableSettings = {
  hide_title?: boolean;
  /** Per-joint [lower, upper] in radians; a joint without one reports no proximity. */
  joint_limits: Record<string, [number, number]>;
  messageType: string;
  show_details: boolean;
  topic: string;
};

export const JOINT_TABLE_DEFAULT_SETTINGS: JointTableSettings = {
  joint_limits: {},
  messageType: "sensor_msgs/msg/JointState",
  show_details: false,
  topic: "/joint_states",
};

export const jointTableContract = createContract(
  "joint-table",
  [
    { key: "topic", label: "Joint state topic", type: "text", required: true },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "joint_limits", label: "Joint limits (name: [lower, upper])", type: "json", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  JOINT_TABLE_DEFAULT_SETTINGS,
  (settings) => {
    const errors = [...validateString(settings, "topic"), ...validateBoolean(settings, "show_details")];
    return errors.length > 0 ? fail(errors) : succeed(settings as JointTableSettings);
  },
);
