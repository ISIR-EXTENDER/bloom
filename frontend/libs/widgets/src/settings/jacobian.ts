import { createContract, fail, succeed, validateBoolean, validateString } from "./validation";

export type JacobianSettings = {
  messageType: string;
  show_details: boolean;
  topic: string;
};

export const JACOBIAN_DEFAULT_SETTINGS: JacobianSettings = {
  messageType: "std_msgs/msg/Float64MultiArray",
  show_details: false,
  topic: "/ee_jac",
};

export const jacobianContract = createContract(
  "jacobian",
  [
    { key: "topic", label: "Jacobian topic", type: "text", required: true },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  JACOBIAN_DEFAULT_SETTINGS,
  (settings) => {
    const errors = [...validateString(settings, "topic"), ...validateBoolean(settings, "show_details")];
    return errors.length > 0 ? fail(errors) : succeed(settings as JacobianSettings);
  },
);
