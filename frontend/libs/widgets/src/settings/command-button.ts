import { isRecord } from "../values";
import {
  createContract,
  fail,
  isJsonSerializable,
  succeed,
  validateBoolean,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationError,
  type WidgetSettingsValidationResult,
} from "./validation";

export type CommandActionFeedbackMode = "none" | "progress" | "result";

export type TeleopFrameRuntimeBinding = {
  adapter: "teleop-frame";
  frame_id: string;
};

export type CommandButtonSettings = {
  action_feedback: CommandActionFeedbackMode;
  action_id: string;
  action_label: string;
  button_label: string;
  cancellable: boolean;
  command: string;
  /**
   * Require a second press before the action is dispatched.
   *
   * Meant for commands that move the robot with no way to interrupt them, such
   * as a `cartesian_manager` named joint target: the manager dispatches the
   * pose once and reports no progress, so an accidental press is a moving arm.
   */
  confirm_press?: boolean;
  /** Label shown while the button is armed and waiting for the second press. */
  confirm_label?: string;
  /** Seconds before an armed button disarms itself. 0 keeps it armed. */
  confirm_timeout_seconds?: number;
  messageType?: string;
  payload?: unknown;
  presetId?: string;
  runtime_binding?: TeleopFrameRuntimeBinding;
  topic?: string;
};

export const COMMAND_BUTTON_DEFAULT_SETTINGS: CommandButtonSettings = {
  action_feedback: "none",
  action_id: "",
  action_label: "",
  button_label: "",
  cancellable: false,
  command: "",
  confirm_label: "Confirm?",
  confirm_press: false,
  confirm_timeout_seconds: 5,
  messageType: "",
  payload: "",
  presetId: "",
  topic: "",
};

export const commandButtonContract = createContract(
  "command-button",
  [
    { key: "command", label: "Command", type: "text", required: true },
    { key: "button_label", label: "Button label", type: "text", required: false },
    { key: "action_id", label: "Action id", type: "text", required: false },
    { key: "action_label", label: "Action label", type: "text", required: false },
    // Not required: nothing reads either one, so demanding an answer promised a behaviour that
    // does not exist. They stay in the contract so shipped apps keep validating.
    {
      key: "action_feedback",
      label: "Action feedback",
      type: "select",
      required: false,
      options: ["none", "progress", "result"],
    },
    { key: "cancellable", label: "Cancellable", type: "boolean", required: false },
    // Hold to run: the shipped Snake button. The released payload is what goes out on let-go.
    { key: "momentary", label: "Hold to run", type: "boolean", required: false },
    { key: "pressed_label", label: "Label while held", type: "text", required: false },
    { key: "released_label", label: "Label when released", type: "text", required: false },
    { key: "releasedPayload", label: "Payload on release", type: "json", required: false },
    // Press twice to move: the guard on every joint-target button.
    { key: "confirm_press", label: "Confirm the press", type: "boolean", required: false },
    { key: "confirm_label", label: "Confirm label", type: "text", required: false },
    {
      key: "confirm_timeout_seconds",
      label: "Stays armed for (s, 0 = until pressed again)",
      type: "number",
      required: false,
    },
    { key: "variant", label: "Emphasis", type: "select", required: false, options: ["default", "danger"] },
    { key: "hint", label: "Hint", type: "text", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: false },
    { key: "topic", label: "Output topic", type: "text", required: false },
    { key: "messageType", label: "ROS message type", type: "text", required: false },
    { key: "payload", label: "Payload", type: "json", required: false },
    { key: "presetId", label: "Preset id", type: "text", required: false },
    { key: "runtime_binding", label: "Runtime binding", type: "json", required: false },
  ],
  COMMAND_BUTTON_DEFAULT_SETTINGS,
  validateCommandButtonSettings,
);

function validateCommandButtonSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<CommandButtonSettings> {
  const errors = [
    ...validateString(settings, "command", { allowEmpty: true }),
    ...validateString(settings, "button_label", { allowEmpty: true }),
    ...validateString(settings, "action_id", { allowEmpty: true }),
    ...validateString(settings, "action_label", { allowEmpty: true }),
    ...validateOneOf(settings, "action_feedback", ["none", "progress", "result"]),
    ...validateBoolean(settings, "cancellable"),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "presetId", { allowEmpty: true }),
  ];
  if ("runtime_binding" in settings && settings.runtime_binding !== undefined) {
    errors.push(...validateTeleopFrameRuntimeBinding(settings.runtime_binding));
  }
  if (!isJsonSerializable(settings.payload)) {
    errors.push({ field: "payload", message: "payload must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CommandButtonSettings);
}

function validateTeleopFrameRuntimeBinding(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "runtime_binding", message: "runtime_binding must be an object" }];
  }

  const errors: WidgetSettingsValidationError[] = [];
  if (value.adapter !== "teleop-frame") {
    errors.push({ field: "runtime_binding.adapter", message: "adapter must be teleop-frame" });
  }
  if (typeof value.frame_id !== "string" || value.frame_id.trim().length === 0) {
    errors.push({ field: "runtime_binding.frame_id", message: "frame_id is required" });
  }
  return errors;
}
