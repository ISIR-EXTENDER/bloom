import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type GesturePadSettings = {
  angleLabel: string;
  command: string;
  messageType?: string;
  powerLabel: string;
  show_details: boolean;
  topic?: string;
};

export const GESTURE_PAD_DEFAULT_SETTINGS: GesturePadSettings = {
  angleLabel: "Angle",
  command: "gesture",
  messageType: "",
  powerLabel: "Power",
  show_details: false,
  topic: "",
};

export const gesturePadContract = createContract(
  "gesture-pad",
  [
    // Not required: the dispatcher never reads the binding this becomes, so an answer changes
    // nothing. Output topic and message type are what make a gesture pad publish.
    { key: "command", label: "Command", type: "text", required: false },
    { key: "topic", label: "Output topic", type: "text", required: false },
    { key: "messageType", label: "ROS message type", type: "text", required: false },
    { key: "angleLabel", label: "Angle label", type: "text", required: true },
    { key: "powerLabel", label: "Power label", type: "text", required: true },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  GESTURE_PAD_DEFAULT_SETTINGS,
  validateGesturePadSettings,
);

function validateGesturePadSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<GesturePadSettings> {
  const errors = [
    ...validateString(settings, "command", { allowEmpty: true }),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "angleLabel"),
    ...validateString(settings, "powerLabel"),
    ...validateBoolean(settings, "show_details"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as GesturePadSettings);
}
