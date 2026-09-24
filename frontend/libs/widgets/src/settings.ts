import type { WidgetKind } from "@bloom/api-client";
import { cameraContract, normalizeCameraCompatibility } from "./settings/camera";
import { commandButtonContract } from "./settings/command-button";
import { eventLogContract } from "./settings/event-log";
import { gaugeContract } from "./settings/gauge";
import { gesturePadContract } from "./settings/gesture-pad";
import { jacobianContract } from "./settings/jacobian";
import { jointTableContract } from "./settings/joint-table";
import { joystickContract, normalizeJoystickCompatibility } from "./settings/joystick";
import { labelContract } from "./settings/label";
import { plotContract } from "./settings/plot";
import { plotBoardContract } from "./settings/plot-board";
import { plotPickerContract } from "./settings/plot-picker";
import { positionLibraryContract } from "./settings/position-library";
import { robot3dContract } from "./settings/robot-3d";
import { normalizeSliderCompatibility, sliderContract } from "./settings/slider";
import { toggleContract } from "./settings/toggle";
import { topicEchoContract } from "./settings/topic-echo";
import { topicPlotContract } from "./settings/topic-plot";
import { unknownContract } from "./settings/unknown";
import { cloneSettings, type WidgetSettingsContract, type WidgetSettingsValidationResult } from "./settings/validation";
import { valueStripContract } from "./settings/value-strip";

export * from "./settings/camera";
export * from "./settings/command-button";
export * from "./settings/event-log";
export * from "./settings/gauge";
export * from "./settings/gesture-pad";
export * from "./settings/jacobian";
export * from "./settings/joint-table";
export * from "./settings/joystick";
export * from "./settings/label";
export * from "./settings/plot";
export * from "./settings/plot-board";
export * from "./settings/plot-picker";
export * from "./settings/position-library";
export * from "./settings/presets";
export * from "./settings/robot-3d";
export * from "./settings/slider";
export * from "./settings/toggle";
export * from "./settings/topic-echo";
export * from "./settings/topic-plot";
export * from "./settings/unknown";
export * from "./settings/validation";
export * from "./settings/value-strip";

export const WIDGET_SETTINGS_CONTRACTS: Readonly<Record<WidgetKind, WidgetSettingsContract>> = {
  camera: cameraContract,
  "command-button": commandButtonContract,
  "event-log": eventLogContract,
  gauge: gaugeContract,
  "gesture-pad": gesturePadContract,
  joystick: joystickContract,
  label: labelContract,
  plot: plotContract,
  slider: sliderContract,
  toggle: toggleContract,
  "topic-echo": topicEchoContract,
  "topic-plot": topicPlotContract,
  "joint-table": jointTableContract,
  jacobian: jacobianContract,
  "plot-board": plotBoardContract,
  "plot-picker": plotPickerContract,
  "value-strip": valueStripContract,
  "position-library": positionLibraryContract,
  "robot-3d": robot3dContract,
  unknown: unknownContract,
};

export function getWidgetSettingsContract(kind: WidgetKind): WidgetSettingsContract {
  return WIDGET_SETTINGS_CONTRACTS[kind] ?? WIDGET_SETTINGS_CONTRACTS.unknown;
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
  if (kind === "joystick") {
    return validateWidgetSettings(kind, normalizeJoystickCompatibility(mergedSettings, settings));
  }
  if (kind === "camera") {
    return validateWidgetSettings(kind, normalizeCameraCompatibility(mergedSettings));
  }
  if (kind === "slider") {
    return validateWidgetSettings(kind, {
      ...getDefaultWidgetSettings(kind),
      ...normalizeSliderCompatibility(settings),
    });
  }
  return validateWidgetSettings(kind, mergedSettings);
}
