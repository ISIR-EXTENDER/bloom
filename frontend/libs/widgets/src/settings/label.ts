import {
  createContract,
  fail,
  succeed,
  validateNumber,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type LabelSettings = {
  align: "left" | "center" | "right";
  fontSize: number;
  text: string;
};

export const LABEL_DEFAULT_SETTINGS: LabelSettings = {
  align: "left",
  fontSize: 20,
  text: "Text",
};

export const labelContract = createContract(
  "label",
  [
    { key: "text", label: "Text", type: "text", required: true },
    { key: "fontSize", label: "Font size", type: "number", required: true },
    { key: "align", label: "Alignment", type: "select", required: true, options: ["left", "center", "right"] },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: false },
  ],
  LABEL_DEFAULT_SETTINGS,
  validateLabelSettings,
);

function validateLabelSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<LabelSettings> {
  const errors = [
    ...validateString(settings, "text", { allowEmpty: true }),
    ...validateNumber(settings, "fontSize", { min: 1 }),
    ...validateOneOf(settings, "align", ["left", "center", "right"]),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as LabelSettings);
}
