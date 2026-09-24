import { createContract, fail, isJsonSerializable, succeed, type WidgetSettingsValidationResult } from "./validation";

export type UnknownWidgetSettings = Record<string, unknown>;

export const UNKNOWN_DEFAULT_SETTINGS: UnknownWidgetSettings = {};

export const unknownContract = createContract("unknown", [], UNKNOWN_DEFAULT_SETTINGS, validateUnknownSettings);

function validateUnknownSettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<UnknownWidgetSettings> {
  if (!isJsonSerializable(settings)) {
    return fail([{ field: "settings", message: "settings must be JSON serializable" }]);
  }
  return succeed(settings);
}
