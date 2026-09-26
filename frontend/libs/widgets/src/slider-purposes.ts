import { speedSliderSettings } from "./robot-axes";
import { asRecord } from "./values";

/**
 * What a slider can be on the manager stack, each as the shipped Explorer and Kinova apps write it. A slider
 * became Height, Pivot or a gain only through hand-written `runtime_binding` JSON.
 */
export type SliderPurpose = {
  id: "linear-speed" | "angular-speed" | "height" | "pivot" | "snake-gain";
  label: string;
  title: string;
  settings: (robotName?: string) => Record<string, unknown>;
};

const TELEOP_TOPIC = "/joystick_cartesian_command";

const teleopAxis = (component: string, scale?: number) => ({
  adapter: "teleop",
  target: component,
  axis_mapping: { value: scale === undefined ? { component } : { component, scale } },
  value_mapping: { target_topic: TELEOP_TOPIC },
  axis_deadzone: 0.2,
});

export const SLIDER_PURPOSES: readonly SliderPurpose[] = [
  { id: "linear-speed", label: "Speed limit (moving)", title: "Max linear speed", settings: speedSliderSettings },
  {
    id: "angular-speed",
    label: "Speed limit (turning)",
    title: "Max angular speed",
    settings: () => ({
      direction: "horizontal",
      max: 0.8,
      min: 0,
      step: 0.04,
      value: 0.4,
      unit: "rad/s",
      topic: "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed",
      messageType: "std_msgs/msg/Float64",
    }),
  },
  {
    id: "height",
    label: "Hand height (up and down)",
    title: "Height",
    settings: () => ({
      direction: "vertical",
      max: 1,
      min: -1,
      step: 0.01,
      value: 0,
      returnToCenter: true,
      runtime_binding: teleopAxis("linear_z"),
    }),
  },
  {
    id: "pivot",
    label: "Pivot (turn left and right)",
    title: "Pivot",
    settings: () => ({
      direction: "horizontal",
      max: 1,
      min: -1,
      step: 0.01,
      value: 0,
      returnToCenter: true,
      runtime_binding: teleopAxis("angular_z", -1),
      labels: { negative: "↶ Turn left", positive: "Turn right ↷" },
    }),
  },
  {
    id: "snake-gain",
    label: "Snake gain (manager tuning)",
    title: "Snake gain",
    settings: () => ({
      direction: "horizontal",
      max: 10,
      min: 0,
      step: 0.1,
      value: 3,
      unit: "",
      runtime_binding: {
        adapter: "parameter",
        target: "parameter",
        value_mapping: { node: "/cartesian_manager", parameter: "shapers.snake.gain" },
      },
    }),
  },
];

/** The keys a purpose owns: switching replaces all of them, so no part of the previous purpose lingers. */
export const SLIDER_PURPOSE_KEYS = [
  "direction",
  "labels",
  "max",
  "messageType",
  "min",
  "returnToCenter",
  "runtime_binding",
  "step",
  "topic",
  "unit",
  "value",
] as const;

/** Which purpose a slider already has, read from where it sends; null for anything else. */
export function sliderPurposeOf(settings: Record<string, unknown>): SliderPurpose["id"] | null {
  const binding = asRecord(settings.runtime_binding);
  const component = asRecord(asRecord(binding.axis_mapping).value).component;
  const mapping = asRecord(binding.value_mapping);
  if (binding.adapter === "teleop") {
    return component === "linear_z" ? "height" : component === "angular_z" ? "pivot" : null;
  }
  if (binding.adapter === "parameter") {
    return mapping.parameter === "shapers.snake.gain" ? "snake-gain" : null;
  }
  if (settings.topic === "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed") return "linear-speed";
  if (settings.topic === "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed") return "angular-speed";
  return null;
}
