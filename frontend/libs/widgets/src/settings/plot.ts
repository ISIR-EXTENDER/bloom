import {
  createContract,
  fail,
  isNumber,
  succeed,
  validateBoolean,
  validateNumber,
  validateNumberArray,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type PlotSettings = {
  fieldPath: string;
  historySeconds: number;
  maxSamples: number;
  messageType: string;
  samples: number[];
  show_details: boolean;
  showLegend: boolean;
  topic: string;
  unit: string;
  variant: "area" | "bars" | "sparkline";
  yMax?: number;
  yMin?: number;
};

export const PLOT_DEFAULT_SETTINGS: PlotSettings = {
  fieldPath: "data",
  historySeconds: 10,
  maxSamples: 500,
  messageType: "",
  samples: [0.18, 0.34, 0.28, 0.52, 0.47, 0.68, 0.61, 0.79, 0.73, 0.88],
  show_details: false,
  showLegend: true,
  topic: "",
  unit: "",
  variant: "area",
};

export const plotContract = createContract(
  "plot",
  [
    { key: "topic", label: "Input topic", type: "text", required: false },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "fieldPath", label: "Field path", type: "text", required: false },
    { key: "historySeconds", label: "History duration", type: "number", required: true },
    { key: "maxSamples", label: "Maximum samples", type: "number", required: true },
    { key: "showLegend", label: "Show legend", type: "boolean", required: true },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    { key: "samples", label: "Preview samples", type: "json", required: true },
    { key: "variant", label: "Variant", type: "select", required: true, options: ["area", "bars", "sparkline"] },
    { key: "unit", label: "Unit", type: "text", required: false },
    { key: "yMin", label: "Y minimum", type: "number", required: false },
    { key: "yMax", label: "Y maximum", type: "number", required: false },
  ],
  PLOT_DEFAULT_SETTINGS,
  validatePlotSettings,
);

function validatePlotSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<PlotSettings> {
  const errors = [
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath", { allowEmpty: true }),
    ...validateNumber(settings, "historySeconds", { min: 1 }),
    ...validateNumber(settings, "maxSamples", { min: 1 }),
    ...validateBoolean(settings, "show_details"),
    ...validateBoolean(settings, "showLegend"),
    ...validateNumberArray(settings.samples, "samples"),
    ...validateOneOf(settings, "variant", ["area", "bars", "sparkline"]),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if (settings.yMin !== undefined) {
    errors.push(...validateNumber(settings, "yMin"));
  }
  if (settings.yMax !== undefined) {
    errors.push(...validateNumber(settings, "yMax"));
  }
  if (isNumber(settings.yMin) && isNumber(settings.yMax) && settings.yMin >= settings.yMax) {
    errors.push({ field: "yMax", message: "yMax must be greater than yMin" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotSettings);
}
