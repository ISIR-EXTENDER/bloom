import type { WidgetKind } from "@bloom/api-client";
import { isRecord } from "../values";

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

export function createContract<TSettings extends Record<string, unknown>>(
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

export function succeed<TSettings extends Record<string, unknown>>(
  settings: TSettings,
): WidgetSettingsValidationResult<TSettings> {
  return {
    success: true,
    settings,
  };
}

export function fail(errors: WidgetSettingsValidationError[]): WidgetSettingsValidationResult<never> {
  return {
    success: false,
    errors,
  };
}

export function validateBoolean(settings: Record<string, unknown>, field: string): WidgetSettingsValidationError[] {
  return typeof settings[field] === "boolean" ? [] : [{ field, message: `${field} must be a boolean` }];
}

export function validateNumber(
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

export function validateNumberArray(value: unknown, field: string): WidgetSettingsValidationError[] {
  if (!Array.isArray(value)) {
    return [{ field, message: `${field} must be an array` }];
  }
  return value.every((candidate) => typeof candidate === "number" && Number.isFinite(candidate))
    ? []
    : [{ field, message: `${field} must contain only finite numbers` }];
}

export function validateOneOf(
  settings: Record<string, unknown>,
  field: string,
  options: string[],
): WidgetSettingsValidationError[] {
  return typeof settings[field] === "string" && options.includes(settings[field])
    ? []
    : [{ field, message: `${field} must be one of: ${options.join(", ")}` }];
}

export function validateString(
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

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isSameJson(left: unknown, right: unknown): boolean {
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => isSameJson(left[key], right[key]));
  }
  return left === right;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((candidate) => typeof candidate === "string");
}

export function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

export function cloneSettings<TSettings extends Record<string, unknown>>(settings: TSettings): TSettings {
  return JSON.parse(JSON.stringify(settings)) as TSettings;
}

export function validatePlotSeriesList(settings: Record<string, unknown>) {
  if (!Array.isArray(settings.series)) {
    return [{ field: "series", message: "series must be a list" }];
  }
  return settings.series.flatMap((entry, index) =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as Record<string, unknown>).topic === "string" &&
    String((entry as Record<string, unknown>).topic).startsWith("/") &&
    typeof ((entry as Record<string, unknown>).field_path ?? (entry as Record<string, unknown>).fieldPath) === "string"
      ? []
      : [{ field: "series", message: `series ${index + 1} needs an absolute topic and a field_path` }],
  );
}

/** A slider, a toggle or a joystick's runtime binding: which adapter, and what a parameter binding must name. */
export function validateRuntimeBinding(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "runtime_binding", message: "runtime_binding must be an object" }];
  }

  const errors: WidgetSettingsValidationError[] = [];
  if (typeof value.adapter !== "string" || !["custom", "parameter", "teleop", "topic"].includes(value.adapter)) {
    errors.push({
      field: "runtime_binding.adapter",
      message: "adapter must be one of: custom, parameter, teleop, topic",
    });
  }
  if (value.adapter === "parameter") {
    const mapping = isRecord(value.value_mapping) ? value.value_mapping : {};
    if (typeof mapping.node !== "string" || !mapping.node.startsWith("/")) {
      errors.push({ field: "runtime_binding.value_mapping.node", message: "node must be a ROS node name" });
    }
    if (typeof mapping.parameter !== "string" || mapping.parameter.trim().length === 0) {
      errors.push({ field: "runtime_binding.value_mapping.parameter", message: "parameter is required" });
    }
  }
  if (typeof value.target !== "string" || value.target.trim().length === 0) {
    errors.push({ field: "runtime_binding.target", message: "target is required" });
  }
  if (
    "value_mapping" in value &&
    value.value_mapping !== undefined &&
    (!isRecord(value.value_mapping) || !isJsonSerializable(value.value_mapping))
  ) {
    errors.push({ field: "runtime_binding.value_mapping", message: "value_mapping must be a JSON object" });
  }
  return errors;
}
