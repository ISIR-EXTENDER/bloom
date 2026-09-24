import {
  createContract,
  fail,
  isJsonSerializable,
  succeed,
  validateBoolean,
  validateRuntimeBinding,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type ToggleSettings = {
  hide_title?: boolean;
  offLabel: string;
  initialValue: boolean;
  messageType?: string;
  offPayload: unknown;
  onLabel: string;
  onPayload: unknown;
  presetId?: string;
  show_details: boolean;
  topic?: string;
};

/** The contract fallback for a field a toggle does not carry; the palette's starting point is separate. */
export const TOGGLE_DEFAULT_SETTINGS: ToggleSettings = {
  initialValue: false,
  offLabel: "Inactive",
  offPayload: false,
  onLabel: "Active",
  onPayload: true,
  show_details: false,
};

export const toggleContract = createContract(
  "toggle",
  [
    { key: "initialValue", label: "Initial value", type: "boolean", required: true },
    { key: "topic", label: "Output topic", type: "text", required: false },
    { key: "messageType", label: "ROS message type", type: "text", required: false },
    { key: "onLabel", label: "Active label", type: "text", required: true },
    { key: "offLabel", label: "Inactive label", type: "text", required: true },
    { key: "onPayload", label: "ON payload", type: "json", required: true },
    { key: "offPayload", label: "OFF payload", type: "json", required: true },
    // The labels above name what the press will do; these name what was commanded.
    { key: "onStateLabel", label: "State when ON", type: "text", required: false },
    { key: "offStateLabel", label: "State when OFF", type: "text", required: false },
    { key: "layout", label: "Layout", type: "select", required: false, options: ["card", "inline"] },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  TOGGLE_DEFAULT_SETTINGS,
  validateToggleSettings,
);

function validateToggleSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<ToggleSettings> {
  const errors = [
    ...validateBoolean(settings, "initialValue"),
    ...validateString(settings, "onLabel"),
    ...validateString(settings, "offLabel"),
    ...validateBoolean(settings, "show_details"),
  ];
  if ("topic" in settings && settings.topic !== undefined) {
    errors.push(...validateString(settings, "topic", { allowEmpty: true }));
  }
  if ("messageType" in settings && settings.messageType !== undefined) {
    errors.push(...validateString(settings, "messageType", { allowEmpty: true }));
  }
  if ("presetId" in settings && settings.presetId !== undefined) {
    errors.push(...validateString(settings, "presetId", { allowEmpty: true }));
  }
  if ("runtime_binding" in settings && settings.runtime_binding !== undefined) {
    errors.push(...validateRuntimeBinding(settings.runtime_binding));
  }
  if (!isJsonSerializable(settings.onPayload)) {
    errors.push({ field: "onPayload", message: "onPayload must be JSON serializable" });
  }
  if (!isJsonSerializable(settings.offPayload)) {
    errors.push({ field: "offPayload", message: "offPayload must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as ToggleSettings);
}
