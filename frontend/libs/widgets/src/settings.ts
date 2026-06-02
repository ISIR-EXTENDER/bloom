import type { WidgetKind } from "@bloom/api-client";

export type WidgetSettingFieldType = "boolean" | "json" | "number" | "select" | "text";

export type WidgetSettingField = {
  key: string;
  label: string;
  type: WidgetSettingFieldType;
  required: boolean;
  options?: string[];
};

export type WidgetSettingsContract<TSettings extends Record<string, unknown> = Record<string, unknown>> = {
  kind: WidgetKind;
  fields: WidgetSettingField[];
  defaultSettings: TSettings;
  validate: (settings: Record<string, unknown>) => WidgetSettingsValidationResult<TSettings>;
};

export type WidgetSettingsValidationError = {
  field: string;
  message: string;
};

export type WidgetSettingsValidationResult<TSettings extends Record<string, unknown> = Record<string, unknown>> =
  | {
      success: true;
      settings: TSettings;
    }
  | {
      success: false;
      errors: WidgetSettingsValidationError[];
    };

export type ButtonSettings = Record<string, never>;

export type CameraSettings = {
  fitMode: "contain" | "cover";
  showHeader: boolean;
  showStatus: boolean;
  streamUrl: string;
};

export type CommandButtonSettings = {
  command: string;
};

export type GaugeSettings = {
  max: number;
  min: number;
  unit: string;
};

export type JoystickSettings = {
  binding: "joy" | "rot";
  deadzone: number;
  labels: {
    bottom: string;
    left: string;
    right: string;
    top: string;
  };
};

export type LabelSettings = {
  align: "left" | "center" | "right";
  fontSize: number;
  text: string;
};

export type PlotSettings = {
  historySeconds: number;
  showLegend: boolean;
};

export type SliderSettings = {
  direction: "horizontal" | "vertical";
  max: number;
  min: number;
  step: number;
};

export type ToggleSettings = {
  initialValue: boolean;
  offPayload: unknown;
  onPayload: unknown;
};

export type UnknownWidgetSettings = Record<string, unknown>;

const BUTTON_DEFAULT_SETTINGS: ButtonSettings = {};

const CAMERA_DEFAULT_SETTINGS: CameraSettings = {
  fitMode: "contain",
  showHeader: true,
  showStatus: true,
  streamUrl: "",
};

const COMMAND_BUTTON_DEFAULT_SETTINGS: CommandButtonSettings = {
  command: "",
};

const GAUGE_DEFAULT_SETTINGS: GaugeSettings = {
  max: 1,
  min: 0,
  unit: "",
};

const JOYSTICK_DEFAULT_SETTINGS: JoystickSettings = {
  binding: "joy",
  deadzone: 0.1,
  labels: { bottom: "Y-", left: "X-", right: "X+", top: "Y+" },
};

const LABEL_DEFAULT_SETTINGS: LabelSettings = {
  align: "left",
  fontSize: 20,
  text: "Text",
};

const PLOT_DEFAULT_SETTINGS: PlotSettings = {
  historySeconds: 10,
  showLegend: true,
};

const SLIDER_DEFAULT_SETTINGS: SliderSettings = {
  direction: "vertical",
  max: 1,
  min: -1,
  step: 0.01,
};

const TOGGLE_DEFAULT_SETTINGS: ToggleSettings = {
  initialValue: false,
  offPayload: false,
  onPayload: true,
};

const UNKNOWN_DEFAULT_SETTINGS: UnknownWidgetSettings = {};

export const WIDGET_SETTINGS_CONTRACTS: Readonly<Record<WidgetKind, WidgetSettingsContract>> = {
  button: createContract("button", [], BUTTON_DEFAULT_SETTINGS, validateButtonSettings),
  camera: createContract(
    "camera",
    [
      { key: "streamUrl", label: "Stream URL", type: "text", required: false },
      { key: "fitMode", label: "Fit mode", type: "select", required: true, options: ["contain", "cover"] },
      { key: "showHeader", label: "Show header", type: "boolean", required: true },
      { key: "showStatus", label: "Show status", type: "boolean", required: true },
    ],
    CAMERA_DEFAULT_SETTINGS,
    validateCameraSettings,
  ),
  "command-button": createContract(
    "command-button",
    [{ key: "command", label: "Command", type: "text", required: true }],
    COMMAND_BUTTON_DEFAULT_SETTINGS,
    validateCommandButtonSettings,
  ),
  gauge: createContract(
    "gauge",
    [
      { key: "min", label: "Minimum", type: "number", required: true },
      { key: "max", label: "Maximum", type: "number", required: true },
      { key: "unit", label: "Unit", type: "text", required: false },
    ],
    GAUGE_DEFAULT_SETTINGS,
    validateGaugeSettings,
  ),
  joystick: createContract(
    "joystick",
    [
      { key: "binding", label: "Binding", type: "select", required: true, options: ["joy", "rot"] },
      { key: "deadzone", label: "Deadzone", type: "number", required: true },
      { key: "labels", label: "Axis labels", type: "json", required: true },
    ],
    JOYSTICK_DEFAULT_SETTINGS,
    validateJoystickSettings,
  ),
  label: createContract(
    "label",
    [
      { key: "text", label: "Text", type: "text", required: true },
      { key: "fontSize", label: "Font size", type: "number", required: true },
      { key: "align", label: "Alignment", type: "select", required: true, options: ["left", "center", "right"] },
    ],
    LABEL_DEFAULT_SETTINGS,
    validateLabelSettings,
  ),
  plot: createContract(
    "plot",
    [
      { key: "historySeconds", label: "History duration", type: "number", required: true },
      { key: "showLegend", label: "Show legend", type: "boolean", required: true },
    ],
    PLOT_DEFAULT_SETTINGS,
    validatePlotSettings,
  ),
  slider: createContract(
    "slider",
    [
      { key: "min", label: "Minimum", type: "number", required: true },
      { key: "max", label: "Maximum", type: "number", required: true },
      { key: "step", label: "Step", type: "number", required: true },
      { key: "direction", label: "Direction", type: "select", required: true, options: ["horizontal", "vertical"] },
    ],
    SLIDER_DEFAULT_SETTINGS,
    validateSliderSettings,
  ),
  toggle: createContract(
    "toggle",
    [
      { key: "initialValue", label: "Initial value", type: "boolean", required: true },
      { key: "onPayload", label: "ON payload", type: "json", required: true },
      { key: "offPayload", label: "OFF payload", type: "json", required: true },
    ],
    TOGGLE_DEFAULT_SETTINGS,
    validateToggleSettings,
  ),
  unknown: createContract("unknown", [], UNKNOWN_DEFAULT_SETTINGS, validateUnknownSettings),
};

export function getWidgetSettingsContract(kind: WidgetKind): WidgetSettingsContract {
  return WIDGET_SETTINGS_CONTRACTS[kind];
}

export function getDefaultWidgetSettings(kind: WidgetKind): Record<string, unknown> {
  return cloneSettings(getWidgetSettingsContract(kind).defaultSettings);
}

export function validateWidgetSettings(
  kind: WidgetKind,
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult {
  return getWidgetSettingsContract(kind).validate(settings);
}

export function normalizeWidgetSettings(
  kind: WidgetKind,
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult {
  const mergedSettings = {
    ...getDefaultWidgetSettings(kind),
    ...settings,
  };
  return validateWidgetSettings(kind, mergedSettings);
}

function createContract<TSettings extends Record<string, unknown>>(
  kind: WidgetKind,
  fields: WidgetSettingField[],
  defaultSettings: TSettings,
  validate: (settings: Record<string, unknown>) => WidgetSettingsValidationResult<TSettings>,
): WidgetSettingsContract<TSettings> {
  return {
    kind,
    fields,
    defaultSettings,
    validate,
  };
}

function validateButtonSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<ButtonSettings> {
  return succeed(settings as ButtonSettings);
}

function validateCameraSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<CameraSettings> {
  const errors = [
    ...validateString(settings, "streamUrl", { allowEmpty: true }),
    ...validateOneOf(settings, "fitMode", ["contain", "cover"]),
    ...validateBoolean(settings, "showHeader"),
    ...validateBoolean(settings, "showStatus"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CameraSettings);
}

function validateCommandButtonSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<CommandButtonSettings> {
  const errors = validateString(settings, "command", { allowEmpty: true });
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CommandButtonSettings);
}

function validateGaugeSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<GaugeSettings> {
  const errors = [
    ...validateNumber(settings, "min"),
    ...validateNumber(settings, "max"),
    ...validateString(settings, "unit", { allowEmpty: true }),
  ];
  if (isNumber(settings.min) && isNumber(settings.max) && settings.min >= settings.max) {
    errors.push({ field: "max", message: "max must be greater than min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as GaugeSettings);
}

function validateJoystickSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<JoystickSettings> {
  const errors = [
    ...validateOneOf(settings, "binding", ["joy", "rot"]),
    ...validateNumber(settings, "deadzone", { min: 0, max: 1 }),
    ...validateJoystickLabels(settings.labels),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as JoystickSettings);
}

function validateLabelSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<LabelSettings> {
  const errors = [
    ...validateString(settings, "text", { allowEmpty: true }),
    ...validateNumber(settings, "fontSize", { min: 1 }),
    ...validateOneOf(settings, "align", ["left", "center", "right"]),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as LabelSettings);
}

function validatePlotSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<PlotSettings> {
  const errors = [
    ...validateNumber(settings, "historySeconds", { min: 1 }),
    ...validateBoolean(settings, "showLegend"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as PlotSettings);
}

function validateSliderSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<SliderSettings> {
  const errors = [
    ...validateNumber(settings, "min"),
    ...validateNumber(settings, "max"),
    ...validateNumber(settings, "step", { min: 0 }),
    ...validateOneOf(settings, "direction", ["horizontal", "vertical"]),
  ];
  if (isNumber(settings.min) && isNumber(settings.max) && settings.min >= settings.max) {
    errors.push({ field: "max", message: "max must be greater than min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as SliderSettings);
}

function validateToggleSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<ToggleSettings> {
  const errors = validateBoolean(settings, "initialValue");
  if (!isJsonSerializable(settings.onPayload)) {
    errors.push({ field: "onPayload", message: "onPayload must be JSON serializable" });
  }
  if (!isJsonSerializable(settings.offPayload)) {
    errors.push({ field: "offPayload", message: "offPayload must be JSON serializable" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as ToggleSettings);
}

function validateUnknownSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<UnknownWidgetSettings> {
  if (!isJsonSerializable(settings)) {
    return fail([{ field: "settings", message: "settings must be JSON serializable" }]);
  }
  return succeed(settings);
}

function validateJoystickLabels(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "labels", message: "labels must be an object" }];
  }
  return ["bottom", "left", "right", "top"].flatMap((key) =>
    typeof value[key] === "string" ? [] : [{ field: `labels.${key}`, message: `${key} label must be a string` }],
  );
}

function validateBoolean(settings: Record<string, unknown>, field: string): WidgetSettingsValidationError[] {
  return typeof settings[field] === "boolean" ? [] : [{ field, message: `${field} must be a boolean` }];
}

function validateNumber(
  settings: Record<string, unknown>,
  field: string,
  options: { max?: number; min?: number } = {},
): WidgetSettingsValidationError[] {
  const value = settings[field];
  if (!isNumber(value)) {
    return [{ field, message: `${field} must be a number` }];
  }
  if (options.min !== undefined && value < options.min) {
    return [{ field, message: `${field} must be greater than or equal to ${options.min}` }];
  }
  if (options.max !== undefined && value > options.max) {
    return [{ field, message: `${field} must be less than or equal to ${options.max}` }];
  }
  return [];
}

function validateOneOf(
  settings: Record<string, unknown>,
  field: string,
  options: string[],
): WidgetSettingsValidationError[] {
  return typeof settings[field] === "string" && options.includes(settings[field])
    ? []
    : [{ field, message: `${field} must be one of: ${options.join(", ")}` }];
}

function validateString(
  settings: Record<string, unknown>,
  field: string,
  options: { allowEmpty?: boolean } = {},
): WidgetSettingsValidationError[] {
  const value = settings[field];
  if (typeof value !== "string") {
    return [{ field, message: `${field} must be a string` }];
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    return [{ field, message: `${field} is required` }];
  }
  return [];
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function cloneSettings<TSettings extends Record<string, unknown>>(settings: TSettings): TSettings {
  return JSON.parse(JSON.stringify(settings)) as TSettings;
}

function succeed<TSettings extends Record<string, unknown>>(
  settings: TSettings,
): WidgetSettingsValidationResult<TSettings> {
  return {
    success: true,
    settings,
  };
}

function fail(errors: WidgetSettingsValidationError[]): WidgetSettingsValidationResult<never> {
  return {
    success: false,
    errors,
  };
}
