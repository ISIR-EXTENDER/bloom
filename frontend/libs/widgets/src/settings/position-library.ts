import { createContract, validateBoolean, validateString, type WidgetSettingsValidationResult } from "./validation";

export type PositionLibrarySettings = {
  /** Rename, delete and export: the bench's tools. Off leaves save and Go to, the operator's. */
  editable?: boolean;
  /** The hand's PoseStamped, saved beside the joints so Go to can send the arm back; empty saves joints only. */
  eePoseTopic?: string;
  /** Each saved pose offers Go to: an armed press sends it to cartesian_manager's pose_target topic. */
  go_to?: boolean;
  hide_title?: boolean;
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
    { key: "eePoseTopic", label: "Hand pose topic (geometry_msgs/msg/PoseStamped)", type: "text", required: false },
    { key: "go_to", label: "Offer Go to on each saved pose", type: "boolean", required: false },
    { key: "editable", label: "Offer rename, delete and export", type: "boolean", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
    { key: "show_details", label: "Show runtime details", type: "boolean", required: true },
  ],
  POSITION_LIBRARY_DEFAULT_SETTINGS,
  validatePositionLibrarySettings,
);

function validatePositionLibrarySettings(
  settings: Record<string, unknown>,
): WidgetSettingsValidationResult<PositionLibrarySettings> {
  const errors = [
    ...validateString(settings, "jointStateTopic"),
    ...validateBoolean(settings, "show_details"),
    ...(settings.eePoseTopic === undefined ? [] : validateString(settings, "eePoseTopic", { allowEmpty: true })),
    ...(settings.go_to === undefined ? [] : validateBoolean(settings, "go_to")),
    ...(settings.editable === undefined ? [] : validateBoolean(settings, "editable")),
  ];
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
