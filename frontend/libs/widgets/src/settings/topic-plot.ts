import {
  createContract,
  fail,
  isNumber,
  succeed,
  validateBoolean,
  validateNumber,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type TopicPlotSettings = {
  fieldPath: string;
  historySeconds: number;
  maxSamples: number;
  messageType: string;
  show_details: boolean;
  topic: string;
  unit: string;
  variant: "area" | "bars" | "sparkline";
  yMax?: number;
  yMin?: number;
};

export const TOPIC_PLOT_DEFAULT_SETTINGS: TopicPlotSettings = {
  fieldPath: "data",
  historySeconds: 30,
  maxSamples: 500,
  messageType: "",
  show_details: true,
  topic: "",
  unit: "",
  variant: "area",
};

export const topicPlotContract = createContract(
  "topic-plot",
  [
    { key: "topic", label: "Topic", type: "text", required: true },
    { key: "messageType", label: "Message type", type: "text", required: false },
    { key: "fieldPath", label: "Field path", type: "text", required: true },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    { key: "historySeconds", label: "History duration", type: "number", required: true },
    { key: "maxSamples", label: "Max samples", type: "number", required: true },
    { key: "variant", label: "Variant", type: "select", required: true, options: ["area", "bars", "sparkline"] },
    { key: "unit", label: "Unit", type: "text", required: false },
    { key: "yMin", label: "Y minimum", type: "number", required: false },
    { key: "yMax", label: "Y maximum", type: "number", required: false },
  ],
  TOPIC_PLOT_DEFAULT_SETTINGS,
  validateTopicPlotSettings,
);

function validateTopicPlotSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<TopicPlotSettings> {
  const errors = [
    ...validateString(settings, "topic"),
    ...validateString(settings, "messageType", { allowEmpty: true }),
    ...validateString(settings, "fieldPath"),
    ...validateBoolean(settings, "show_details"),
    ...validateNumber(settings, "historySeconds", { min: 1 }),
    ...validateNumber(settings, "maxSamples", { min: 1 }),
    ...validateOneOf(settings, "variant", ["area", "bars", "sparkline"]),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if ("yMin" in settings && settings.yMin !== undefined) {
    errors.push(...validateNumber(settings, "yMin"));
  }
  if ("yMax" in settings && settings.yMax !== undefined) {
    errors.push(...validateNumber(settings, "yMax"));
  }
  if (isNumber(settings.yMin) && isNumber(settings.yMax) && settings.yMin >= settings.yMax) {
    errors.push({ field: "yMax", message: "yMax must be greater than yMin" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as TopicPlotSettings);
}
