import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validatePlotSeriesList,
  type WidgetSettingsValidationResult,
} from "./validation";

export type ValueStripSettings = {
  hide_title?: boolean;
  series: Record<string, unknown>[];
  show_details: boolean;
};

export const VALUE_STRIP_DEFAULT_SETTINGS: ValueStripSettings = {
  series: [],
  show_details: false,
};

export const valueStripContract = createContract(
  "value-strip",
  [
    { key: "series", label: "Series (topic, field_path, label, unit, color)", type: "json", required: true },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  VALUE_STRIP_DEFAULT_SETTINGS,
  validateValueStripSettings,
);

function validateValueStripSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<ValueStripSettings> {
  const errors = [...validatePlotSeriesList(settings), ...validateBoolean(settings, "show_details")];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as ValueStripSettings);
}
