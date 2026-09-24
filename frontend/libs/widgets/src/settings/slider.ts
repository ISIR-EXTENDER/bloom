import type { JoystickRuntimeBinding } from "./joystick";
import {
  createContract,
  fail,
  isNumber,
  succeed,
  validateBoolean,
  validateNumber,
  validateOneOf,
  validateRuntimeBinding,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type SliderSettings = {
  binding?: string;
  direction: "horizontal" | "vertical";
  intent_label: string;
  max: number;
  messageType?: string;
  min: number;
  returnToCenter: boolean;
  runtime_binding?: JoystickRuntimeBinding;
  show_details: boolean;
  step: number;
  topic?: string;
  unit: string;
  value?: number;
};

export const SLIDER_DEFAULT_SETTINGS: SliderSettings = {
  direction: "vertical",
  intent_label: "",
  max: 1,
  min: -1,
  returnToCenter: false,
  show_details: false,
  step: 0.01,
  unit: "",
  value: 0,
};

export const sliderContract = createContract(
  "slider",
  [
    { key: "binding", label: "Binding", type: "text", required: false },
    { key: "min", label: "Minimum", type: "number", required: true },
    { key: "max", label: "Maximum", type: "number", required: true },
    { key: "step", label: "Step", type: "number", required: true },
    { key: "direction", label: "Direction", type: "select", required: true, options: ["horizontal", "vertical"] },
    { key: "intent_label", label: "Operator intent", type: "text", required: false },
    { key: "unit", label: "Unit", type: "text", required: false },
    { key: "value", label: "Initial value", type: "number", required: false },
    { key: "returnToCenter", label: "Return to center", type: "boolean", required: true },
    // Segments are how the operator speed limit ships: Slow / Medium / Fast against three values.
    { key: "variant", label: "Style", type: "select", required: false, options: ["continuous", "segments"] },
    { key: "segment_labels", label: "Segment labels", type: "json", required: false },
    { key: "segment_values", label: "Segment values", type: "json", required: false },
    { key: "labels", label: "Direction labels", type: "json", required: false },
    {
      key: "title_placement",
      label: "Title placement",
      type: "select",
      required: false,
      options: ["above", "overlay"],
    },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    { key: "topic", label: "Output topic", type: "text", required: false },
    { key: "messageType", label: "ROS message type", type: "text", required: false },
    { key: "runtime_binding", label: "Runtime binding", type: "json", required: false },
  ],
  SLIDER_DEFAULT_SETTINGS,
  validateSliderSettings,
);

function validateSliderSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<SliderSettings> {
  const errors = [
    ...("binding" in settings && settings.binding !== undefined
      ? validateString(settings, "binding", { allowEmpty: true })
      : []),
    ...validateNumber(settings, "min"),
    ...validateNumber(settings, "max"),
    ...validateNumber(settings, "step", { min: 0 }),
    // A zero step makes the slider compute NaN and silently do nothing.
    ...(settings.step === 0 ? [{ field: "step", message: "step must be greater than 0" }] : []),
    ...("value" in settings && settings.value !== undefined ? validateNumber(settings, "value") : []),
    ...validateOneOf(settings, "direction", ["horizontal", "vertical"]),
    ...("intent_label" in settings && settings.intent_label !== undefined
      ? validateString(settings, "intent_label", { allowEmpty: true })
      : []),
    ...("unit" in settings && settings.unit !== undefined
      ? validateString(settings, "unit", { allowEmpty: true })
      : []),
    ...validateBoolean(settings, "returnToCenter"),
    ...validateBoolean(settings, "show_details"),
    ...("topic" in settings && settings.topic !== undefined
      ? validateString(settings, "topic", { allowEmpty: true })
      : []),
    ...("messageType" in settings && settings.messageType !== undefined
      ? validateString(settings, "messageType", { allowEmpty: true })
      : []),
  ];
  if ("runtime_binding" in settings && settings.runtime_binding !== undefined) {
    errors.push(...validateRuntimeBinding(settings.runtime_binding));
  }
  if (isNumber(settings.min) && isNumber(settings.max) && settings.min >= settings.max) {
    errors.push({ field: "max", message: "max must be greater than min" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as SliderSettings);
}

/** About 20 stops across a slider's travel, per operator feedback. */
export const SLIDER_TARGET_INCREMENTS = 20;

/** Step ≈ range/20, snapped to 1/2/2.5/5 × 10ⁿ. */
export function deriveSliderStep(min: number, max: number): number {
  const range = Math.abs(max - min);
  if (!Number.isFinite(range) || range <= 0) {
    return SLIDER_DEFAULT_SETTINGS.step;
  }

  const rawStep = range / SLIDER_TARGET_INCREMENTS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const roundStep = [1, 2, 2.5, 5, 10]
    .map((multiplier) => multiplier * magnitude)
    .reduce((best, candidate) => (Math.abs(candidate - rawStep) < Math.abs(best - rawStep) ? candidate : best));
  // Trim float noise from the 2.5 multiplier.
  return Number.parseFloat(roundStep.toPrecision(3));
}

/**
 * Alias the snake_case keys configs in the wild carry (orientation,
 * return_to_center). Runs on raw settings so canonical keys win.
 */
export function normalizeSliderCompatibility(settings: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...settings };
  if (!("direction" in settings) && (settings.orientation === "horizontal" || settings.orientation === "vertical")) {
    normalized.direction = settings.orientation;
  }
  if (!("returnToCenter" in settings) && typeof settings.return_to_center === "boolean") {
    normalized.returnToCenter = settings.return_to_center;
  }
  return normalized;
}
