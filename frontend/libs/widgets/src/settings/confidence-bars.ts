import { SHARED_CONTROL_CONFIDENCES_TOPIC } from "../manager-behaviours";
import { createContract, fail, succeed, validateBoolean, validateString } from "./validation";

export type ConfidenceBarsSettings = {
  hide_title?: boolean;
  messageType: string;
  show_details: boolean;
  topic: string;
};

/** The manager's goal confidences while behaviour/shared_control is active, one bar per goal id. */
export const CONFIDENCE_BARS_DEFAULT_SETTINGS: ConfidenceBarsSettings = {
  messageType: "std_msgs/msg/Float64MultiArray",
  show_details: false,
  topic: SHARED_CONTROL_CONFIDENCES_TOPIC,
};

export const confidenceBarsContract = createContract(
  "confidence-bars",
  [
    { key: "topic", label: "Confidences topic (std_msgs/msg/Float64MultiArray)", type: "text", required: true },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  CONFIDENCE_BARS_DEFAULT_SETTINGS,
  (settings) => {
    const errors = [...validateString(settings, "topic"), ...validateBoolean(settings, "show_details")];
    return errors.length > 0 ? fail(errors) : succeed(settings as ConfidenceBarsSettings);
  },
);
