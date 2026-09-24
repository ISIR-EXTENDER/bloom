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
  description: string;
  jointStateTopic: string;
  modelSource: "extension" | "urdf-url";
  robotModelUrl: string;
  showAxes: boolean;
};

export const ROBOT_3D_DEFAULT_SETTINGS: Robot3dSettings = {
  description: "Optional 3D robot visualization extension.",
  jointStateTopic: "/joint_states",
  modelSource: "extension",
  robotModelUrl: "",
  showAxes: true,
};

export const robot3dContract = createContract(
  "robot-3d",
  [
    // Not required: nothing fetches a model, which the palette's maturity note already says.
    {
      key: "modelSource",
      label: "Model source",
      type: "select",
      required: false,
      options: ["extension", "urdf-url"],
    },
    { key: "robotModelUrl", label: "Robot model URL", type: "text", required: false },
    { key: "jointStateTopic", label: "Joint state topic", type: "text", required: true },
    { key: "showAxes", label: "Show axes", type: "boolean", required: true },
    { key: "description", label: "Description", type: "text", required: false },
  ],
  ROBOT_3D_DEFAULT_SETTINGS,
  validateRobot3dSettings,
);

function validateRobot3dSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<Robot3dSettings> {
  const errors = [
    ...validateOneOf(settings, "modelSource", ["extension", "urdf-url"]),
    ...validateString(settings, "robotModelUrl", { allowEmpty: true }),
    ...validateString(settings, "jointStateTopic"),
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
