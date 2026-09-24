import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type PlotPickerSettings = {
  hide_title?: boolean;
  plot_id: string;
  show_details: boolean;
  show_unavailable: boolean;
  show_value: boolean;
  unavailable: { label: string; note: string }[];
};

export const PLOT_PICKER_DEFAULT_SETTINGS: PlotPickerSettings = {
  plot_id: "",
  show_details: false,
  show_unavailable: true,
  show_value: false,
  unavailable: [],
};

export const plotPickerContract = createContract(
  "plot-picker",
  [
    { key: "plot_id", label: "Plot board widget id", type: "text", required: true },
    { key: "show_value", label: "Show live values", type: "boolean", required: false },
    { key: "show_unavailable", label: "Show moved series", type: "boolean", required: false },
    { key: "unavailable", label: "Moved series (label, note)", type: "json", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  PLOT_PICKER_DEFAULT_SETTINGS,
  validatePlotPickerSettings,
);

function validatePlotPickerSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PlotPickerSettings> {
  const errors = [...validateString(settings, "plot_id"), ...validateBoolean(settings, "show_details")];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotPickerSettings);
}
