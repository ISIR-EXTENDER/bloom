import {
  createContract,
  fail,
  isNumber,
  succeed,
  validateBoolean,
  validateNumber,
  validatePlotSeriesList,
  type WidgetSettingsValidationResult,
} from "./validation";

export type PlotBoardSettings = {
  history_seconds: number;
  max_samples: number;
  picker: { enabled: boolean; persist_per_profile: boolean };
  series: Record<string, unknown>[];
  show_details: boolean;
  /** Widen y_min/y_max to take in data outside them; never narrower than declared. */
  y_fit_data: boolean;
  y_max: number;
  y_min: number;
};

export const PLOT_BOARD_DEFAULT_SETTINGS: PlotBoardSettings = {
  history_seconds: 30,
  max_samples: 900,
  picker: { enabled: true, persist_per_profile: true },
  series: [],
  show_details: false,
  y_fit_data: true,
  y_max: 1,
  y_min: -1,
};

export const plotBoardContract = createContract(
  "plot-board",
  [
    {
      key: "series",
      label: "Series (topic, field_path, label, unit, color, enabled, emphasis)",
      type: "json",
      required: true,
    },
    { key: "history_seconds", label: "History duration", type: "number", required: true },
    { key: "max_samples", label: "Max samples per series", type: "number", required: true },
    { key: "y_min", label: "Y minimum", type: "number", required: true },
    { key: "y_max", label: "Y maximum", type: "number", required: true },
    { key: "y_fit_data", label: "Widen Y range to fit data", type: "boolean", required: false },
    { key: "picker", label: "Picker", type: "json", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  PLOT_BOARD_DEFAULT_SETTINGS,
  validatePlotBoardSettings,
);

function validatePlotBoardSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PlotBoardSettings> {
  const errors = [
    ...validatePlotSeriesList(settings),
    ...validateNumber(settings, "history_seconds", { min: 1 }),
    ...validateNumber(settings, "max_samples", { min: 1 }),
    ...validateNumber(settings, "y_min"),
    ...validateNumber(settings, "y_max"),
    ...(settings.y_fit_data === undefined ? [] : validateBoolean(settings, "y_fit_data")),
    ...validateBoolean(settings, "show_details"),
  ];
  if (isNumber(settings.y_min) && isNumber(settings.y_max) && settings.y_min >= settings.y_max) {
    errors.push({ field: "y_max", message: "y_max must be greater than y_min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotBoardSettings);
}
