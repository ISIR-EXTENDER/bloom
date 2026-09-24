import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type Robot3dSettings = {
  hide_title?: boolean;
  description: string;
  eeLink: string;
  jointStateTopic: string;
  markerTopic: string;
  modelSource: "extension" | "urdf-url";
  robotModelUrl: string;
  showAxes: boolean;
};

export const ROBOT_3D_DEFAULT_SETTINGS: Robot3dSettings = {
  description: "",
  eeLink: "",
  jointStateTopic: "/joint_states",
  markerTopic: "",
  modelSource: "extension",
  robotModelUrl: "",
  showAxes: true,
};

export const robot3dContract = createContract(
  "robot-3d",
  [
    {
      key: "modelSource",
      label: "Model source",
      type: "select",
      required: false,
      options: ["extension", "urdf-url"],
    },
    { key: "robotModelUrl", label: "Robot model URL", type: "text", required: false },
    { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
    { key: "markerTopic", label: "Marker topic (visualization_msgs/msg/MarkerArray)", type: "text", required: false },
    { key: "eeLink", label: "Tool link for the axes", type: "text", required: false },
    { key: "showAxes", label: "Show axes", type: "boolean", required: true },
    { key: "description", label: "Description", type: "text", required: false },
    { key: "hide_title", label: "Hide the card title", type: "boolean", required: false },
  ],
  ROBOT_3D_DEFAULT_SETTINGS,
  validateRobot3dSettings,
);

function validateRobot3dSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<Robot3dSettings> {
  const errors = [
    ...validateOneOf(settings, "modelSource", ["extension", "urdf-url"]),
    ...validateString(settings, "robotModelUrl", { allowEmpty: true }),
    ...validateString(settings, "jointStateTopic"),
    ...validateString(settings, "markerTopic", { allowEmpty: true }),
    ...validateString(settings, "eeLink", { allowEmpty: true }),
    ...validateBoolean(settings, "showAxes"),
    ...validateString(settings, "description", { allowEmpty: true }),
  ];
  if (
    settings.modelSource === "urdf-url" &&
    typeof settings.robotModelUrl === "string" &&
    !settings.robotModelUrl.trim()
  ) {
    errors.push({ field: "robotModelUrl", message: "robotModelUrl is required when modelSource is urdf-url" });
  }
  if (errors.length > 0) return fail(errors);
  return succeed(settings as Robot3dSettings);
}
