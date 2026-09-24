import { createContract, validateBoolean, validateString, type WidgetSettingsValidationResult } from "./validation";

export type PositionLibrarySettings = {
  /** Capture filter and order; empty captures every joint in the sample. */
  jointNames: string[];
  jointStateTopic: string;
  show_details: boolean;
};

export const POSITION_LIBRARY_DEFAULT_SETTINGS: PositionLibrarySettings = {
  jointNames: [],
  jointStateTopic: "/joint_states",
  show_details: false,
};

export const positionLibraryContract = createContract(
  "position-library",
  [
    { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
    { key: "jointNames", label: "Joint names (capture order)", type: "json", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  POSITION_LIBRARY_DEFAULT_SETTINGS,
  validatePositionLibrarySettings,
);

function validatePositionLibrarySettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PositionLibrarySettings> {
  const errors = [...validateString(settings, "jointStateTopic"), ...validateBoolean(settings, "show_details")];
  const jointNames = settings.jointNames;
  if (jointNames !== undefined) {
    if (!Array.isArray(jointNames) || jointNames.some((name) => typeof name !== "string" || !name.trim())) {
      errors.push({ field: "jointNames", message: "must be a list of joint names" });
    }
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, settings: settings as PositionLibrarySettings };
}
