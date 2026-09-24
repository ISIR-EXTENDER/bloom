import {
  createContract,
  fail,
  succeed,
  validateBoolean,
  validateOneOf,
  validateString,
  type WidgetSettingsValidationResult,
} from "./validation";

export type CameraSettings = {
  fitMode: "contain" | "cover";
  showHeader: boolean;
  showStatus: boolean;
  source: "placeholder" | "ros-topic" | "stream-url" | "webcam";
  streamUrl: string;
  /** The compressed image topic, read only when source is `ros-topic`. */
  topic: string;
  webcamPicker: boolean;
};

export const CAMERA_DEFAULT_SETTINGS: CameraSettings = {
  fitMode: "contain",
  showHeader: true,
  showStatus: true,
  source: "placeholder",
  streamUrl: "",
  topic: "",
  webcamPicker: true,
};

export const cameraContract = createContract(
  "camera",
  [
    { key: "streamUrl", label: "Stream URL", type: "text", required: false },
    // A compressed image topic, not a raw one: the raw frame is converted nowhere on the way.
    { key: "topic", label: "ROS image topic (compressed)", type: "text", required: false },
    {
      key: "source",
      label: "Source",
      type: "select",
      required: true,
      options: ["placeholder", "ros-topic", "stream-url", "webcam"],
    },
    { key: "fitMode", label: "Fit mode", type: "select", required: true, options: ["contain", "cover"] },
    { key: "showHeader", label: "Show header", type: "boolean", required: true },
    { key: "showStatus", label: "Show status", type: "boolean", required: true },
    { key: "webcamPicker", label: "Show webcam picker", type: "boolean", required: true },
  ],
  CAMERA_DEFAULT_SETTINGS,
  validateCameraSettings,
);

function validateCameraSettings(settings: Record<string, unknown>): WidgetSettingsValidationResult<CameraSettings> {
  const errors = [
    ...validateString(settings, "streamUrl", { allowEmpty: true }),
    ...validateString(settings, "topic", { allowEmpty: true }),
    ...validateOneOf(settings, "source", ["placeholder", "ros-topic", "stream-url", "webcam"]),
    ...validateOneOf(settings, "fitMode", ["contain", "cover"]),
    ...validateBoolean(settings, "showHeader"),
    ...validateBoolean(settings, "showStatus"),
    ...validateBoolean(settings, "webcamPicker"),
  ];
  if (errors.length > 0) return fail(errors);
  return succeed(settings as CameraSettings);
}

export function normalizeCameraCompatibility(settings: Record<string, unknown>): Record<string, unknown> {
  const source = typeof settings.source === "string" ? settings.source.trim().toLowerCase() : "";
  if (source === "camera" || source === "rviz" || source === "stream") {
    return {
      ...settings,
      source: "stream-url",
    };
  }
  return settings;
}
