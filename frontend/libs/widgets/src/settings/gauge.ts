import {
  createContract,
  fail,
  isNumber,
  succeed,
  validateBoolean,
  validateNumber,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type GaugeSettings = {
  fieldPath: string;
  max: number;
  messageType: string;
  min: number;
  show_details: boolean;
  topic: string;
  unit: string;
  value: number;
};

export const GAUGE_DEFAULT_SETTINGS: GaugeSettings = {
  fieldPath: "data",
  max: 1,
  messageType: "",
  min: 0,
  show_details: false,
  topic: "",
  unit: "",
  value: 0,
};

export const gaugeContract = createContract(
  "gauge",
  [
    { key: "min", label: "Minimum", type: "number", required: true },
    { key: "max", label: "Maximum", type: "number", required: true },
    { key: "value", label: "Value", type: "number", required: true },
    { key: "topic", label: "Input topic", type: "text", required: false },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "fieldPath", label: "Field path", type: "text", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    { key: "unit", label: "Unit", type: "text", required: false },
  ],
  GAUGE_DEFAULT_SETTINGS,
  validateGaugeSettings,
);

function validateGaugeSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<GaugeSettings> {
  const errors = [
    ...validateNumber(settings, "min"),
    ...validateNumber(settings, "max"),
    ...validateNumber(settings, "value"),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateBoolean(settings, "show_details"),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if (isNumber(settings.min) && isNumber(settings.max) && settings.min >= settings.max) {
    errors.push({ field: "max", message: "max must be greater than min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as GaugeSettings);
}
