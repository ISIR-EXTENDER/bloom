import { TABLET_COMMAND_TOPIC } from "@bloom/api-client";
import { isRecord } from "../values";
import {
  createContract,
  fail,
  isSameJson,
  succeed,
  validateBoolean,
  validateNumber,
  validateOneOf,
  validateRuntimeBinding,
  validateString,
  type WidgetSettingsValidationError,
  type WidgetSettingsValidationResult,
} from "./validation";

export const MAX_JOYSTICK_PUBLISH_RATE_HZ = 30;

export type JoystickAxisSemantic = "custom" | "rotation" | "translation" | "vertical";

export type JoystickAxisHint = {
  color: string;
  negative_label: string;
  positive_label: string;
  semantic: JoystickAxisSemantic;
};

export type JoystickRuntimeBinding = {
  adapter: "custom" | "parameter" | "teleop" | "topic";
  target: string;
  value_mapping?: Record<string, unknown>;
};

export type JoystickSettings = {
  hide_title?: boolean;
  binding?: "joy" | "rot";
  axis_hints: {
    x: JoystickAxisHint;
    y: JoystickAxisHint;
  };
  deadzone: number;
  labels: {
    bottom: string;
    left: string;
    right: string;
    top: string;
  };
  mode_id: string;
  publish_rate_hz: number;
  runtime_binding: JoystickRuntimeBinding;
  show_details: boolean;
  zero_on_release: boolean;
};

export const JOYSTICK_DEFAULT_SETTINGS: JoystickSettings = {
  binding: "joy",
  axis_hints: {
    x: {
      color: "var(--bloom-axis-translation)",
      negative_label: "X-",
      positive_label: "X+",
      semantic: "translation",
    },
    y: {
      color: "var(--bloom-axis-translation)",
      negative_label: "Y-",
      positive_label: "Y+",
      semantic: "translation",
    },
  },
  deadzone: 0.1,
  labels: { bottom: "Y-", left: "X-", right: "X+", top: "Y+" },
  mode_id: "both",
  publish_rate_hz: 30,
  runtime_binding: {
    adapter: "teleop",
    target: "both",
    value_mapping: {
      mode: 3,
      target_topic: TABLET_COMMAND_TOPIC,
    },
  },
  show_details: false,
  zero_on_release: true,
};

export const joystickContract = createContract(
  "joystick",
  [
    { key: "mode_id", label: "Mode", type: "text", required: true },
    { key: "binding", label: "Legacy binding", type: "select", required: false, options: ["joy", "rot"] },
    { key: "deadzone", label: "Deadzone", type: "number", required: true },
    { key: "publish_rate_hz", label: "Publish rate", type: "number", required: true },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
    { key: "zero_on_release", label: "Zero on release", type: "boolean", required: true },
    { key: "labels", label: "Axis labels", type: "json", required: true },
    { key: "axis_hints", label: "Axis hints", type: "json", required: true },
    { key: "runtime_binding", label: "Runtime binding", type: "json", required: true },
  ],
  JOYSTICK_DEFAULT_SETTINGS,
  validateJoystickSettings,
);

function validateJoystickSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<JoystickSettings> {
  const errors = [
    ...("binding" in settings && settings.binding !== undefined
      ? validateOneOf(settings, "binding", ["joy", "rot"])
      : []),
    ...validateString(settings, "mode_id"),
    ...validateNumber(settings, "deadzone", { min: 0, max: 1 }),
    ...validateNumber(settings, "publish_rate_hz", { min: 1, max: MAX_JOYSTICK_PUBLISH_RATE_HZ }),
    ...validateBoolean(settings, "show_details"),
    ...validateBoolean(settings, "zero_on_release"),
    ...validateJoystickLabels(settings.labels),
    ...validateJoystickAxisHints(settings.axis_hints),
    ...validateRuntimeBinding(settings.runtime_binding),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as JoystickSettings);
}

/** True when this pad's axes drive the angular components. */
function drivesRotation(settings: Record<string, unknown>): boolean {
  const runtimeBinding = isRecord(settings.runtime_binding) ? settings.runtime_binding : undefined;
  const axisMapping = runtimeBinding && isRecord(runtimeBinding.axis_mapping) ? runtimeBinding.axis_mapping : undefined;
  if (!axisMapping) {
    return false;
  }
  return Object.values(axisMapping).some(
    (axis) => isRecord(axis) && typeof axis.component === "string" && axis.component.startsWith("angular_"),
  );
}

function validateJoystickLabels(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "labels", message: "labels must be an object" }];
  }
  return ["bottom", "left", "right", "top"].flatMap((key) =>
    typeof value[key] === "string" ? [] : [{ field: `labels.${key}`, message: `${key} label must be a string` }],
  );
}

function validateJoystickAxisHints(value: unknown): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field: "axis_hints", message: "axis_hints must be an object" }];
  }

  return ["x", "y"].flatMap((axis) => validateJoystickAxisHint(value[axis], `axis_hints.${axis}`));
}

function validateJoystickAxisHint(value: unknown, field: string): WidgetSettingsValidationError[] {
  if (!isRecord(value)) {
    return [{ field, message: `${field} must be an object` }];
  }

  const errors: WidgetSettingsValidationError[] = [];
  for (const key of ["color", "negative_label", "positive_label"]) {
    if (typeof value[key] !== "string" || value[key].trim().length === 0) {
      errors.push({ field: `${field}.${key}`, message: `${key} must be a non-empty string` });
    }
  }
  if (
    typeof value.semantic !== "string" ||
    !["custom", "rotation", "translation", "vertical"].includes(value.semantic)
  ) {
    errors.push({
      field: `${field}.semantic`,
      message: "semantic must be one of: custom, rotation, translation, vertical",
    });
  }
  return errors;
}

/**
 * `settings` is already merged with the joystick defaults; `authored` is what the app actually wrote.
 * The distinction matters: the defaults carry translation hints and labels, so asking the merged
 * object whether the author supplied any always answered yes, and the rotation defaults below could
 * never win.
 */
export function normalizeJoystickCompatibility(
  settings: Record<string, unknown>,
  authored: Record<string, unknown>,
): Record<string, unknown> {
  const binding = typeof settings.binding === "string" ? settings.binding : undefined;
  // What the pad moves is the honest answer to which hints it carries. The seeds name their axes in
  // runtime_binding and omit the legacy `binding`, so keying off `binding` alone read every seeded
  // joystick as translation: the Builder showed X+/X- in sage for the rotation pad while the runtime
  // drew RX+/RX- in clay.
  const defaults =
    binding === "rot" || drivesRotation(settings)
      ? ROTATION_JOYSTICK_COMPATIBILITY_DEFAULTS
      : TRANSLATION_JOYSTICK_COMPATIBILITY_DEFAULTS;
  const authoredHints = isRecord(authored.axis_hints) ? authored.axis_hints : undefined;
  const usesDefaultMode = settings.mode_id === JOYSTICK_DEFAULT_SETTINGS.mode_id;
  // Only the untouched default gives way to the rotation defaults; an authored binding keeps its mapping.
  const usesDefaultRuntimeBinding = isSameJson(settings.runtime_binding, JOYSTICK_DEFAULT_SETTINGS.runtime_binding);
  const axisHints = authoredHints
    ? {
        x: {
          ...defaults.axis_hints.x,
          ...(isRecord(authoredHints.x) ? authoredHints.x : {}),
        },
        y: {
          ...defaults.axis_hints.y,
          ...(isRecord(authoredHints.y) ? authoredHints.y : {}),
        },
      }
    : defaults.axis_hints;

  return {
    ...settings,
    axis_hints: axisHints,
    labels: isRecord(authored.labels) ? authored.labels : defaults.labels,
    mode_id:
      typeof settings.mode_id === "string" && settings.mode_id.trim().length > 0 && !usesDefaultMode
        ? settings.mode_id
        : defaults.mode_id,
    runtime_binding:
      isRecord(settings.runtime_binding) && !usesDefaultRuntimeBinding
        ? {
            ...defaults.runtime_binding,
            ...settings.runtime_binding,
          }
        : defaults.runtime_binding,
  };
}

const TRANSLATION_JOYSTICK_COMPATIBILITY_DEFAULTS = {
  axis_hints: JOYSTICK_DEFAULT_SETTINGS.axis_hints,
  labels: JOYSTICK_DEFAULT_SETTINGS.labels,
  mode_id: JOYSTICK_DEFAULT_SETTINGS.mode_id,
  runtime_binding: JOYSTICK_DEFAULT_SETTINGS.runtime_binding,
};

const ROTATION_JOYSTICK_COMPATIBILITY_DEFAULTS = {
  axis_hints: {
    x: {
      color: "var(--bloom-axis-rotation)",
      negative_label: "RX-",
      positive_label: "RX+",
      semantic: "rotation",
    },
    y: {
      color: "var(--bloom-axis-rotation)",
      negative_label: "RY-",
      positive_label: "RY+",
      semantic: "rotation",
    },
  },
  labels: { bottom: "RY-", left: "RX-", right: "RX+", top: "RY+" },
  mode_id: "rotation",
  runtime_binding: {
    adapter: "teleop",
    target: "rotation",
  },
} satisfies Pick<JoystickSettings, "axis_hints" | "labels" | "mode_id" | "runtime_binding">;
