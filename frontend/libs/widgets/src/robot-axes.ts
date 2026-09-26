import { PALETTE_WIRING } from "./palette-wiring";
import { type RobotFamily, robotFamily } from "./robot-family";
import { getDefaultWidgetSettings } from "./settings";

/**
 * Which way a translation pad moves each arm, as the Manager apps drive it.
 *
 * The Explorer's pad is the extender_ui profile (swap X and Y, invert linear X) that the sim check
 * `drive-controls-move-the-hand-as-labelled` holds to its words; the Kinova's is the identity.
 */
type AxisMapping = Record<"x" | "y", { component: string; scale?: number }>;

const TRANSLATION_AXES: Readonly<Record<RobotFamily, AxisMapping>> = {
  explorer: { x: { component: "linear_y" }, y: { component: "linear_x", scale: -1 } },
  kinova: { x: { component: "linear_x" }, y: { component: "linear_y" } },
};

/** A joystick that moves the hand where its words say, on the arm this Bloom drives. */
export function translationPadSettings(robotName?: string): Record<string, unknown> {
  const axes = TRANSLATION_AXES[robotFamily(robotName) ?? "explorer"];
  return {
    ...getDefaultWidgetSettings("joystick"),
    deadzone: 0,
    labels: { top: "▲ Forward", bottom: "▼ Back", left: "◀ Left", right: "Right ▶" },
    mode_id: "both",
    runtime_binding: {
      adapter: "teleop",
      target: "translation",
      value_mapping: { mode: 0, target_topic: "/joystick_cartesian_command" },
      axis_mapping: axes,
      axis_deadzone: 0.2,
    },
  };
}

/** qontrol's configured limits (Explorer 0.1 m/s, Kinova 0.05 m/s) sit mid-range, as in the Manager apps. */
const LINEAR_SPEED_RANGES: Readonly<Record<RobotFamily, { max: number; step: number; value: number }>> = {
  explorer: { max: 0.3, step: 0.015, value: 0.15 },
  kinova: { max: 0.1, step: 0.005, value: 0.05 },
};

/** The max linear speed slider, bounded to what the arm this Bloom drives was validated at. */
export function speedSliderSettings(robotName?: string): Record<string, unknown> {
  return { ...PALETTE_WIRING.slider?.settings, ...LINEAR_SPEED_RANGES[robotFamily(robotName) ?? "explorer"] };
}

/** The Manager apps' Rotation pad: tilt and roll, with its words. The two arms swap which stick axis tilts. */
const ROTATION_AXES: Readonly<Record<RobotFamily, AxisMapping>> = {
  explorer: { x: { component: "angular_y" }, y: { component: "angular_x" } },
  kinova: { x: { component: "angular_x" }, y: { component: "angular_y" } },
};

export function rotationPadSettings(robotName?: string): Record<string, unknown> {
  return {
    ...getDefaultWidgetSettings("joystick"),
    deadzone: 0,
    labels: { top: "▲ Tilt up", bottom: "▼ Tilt down", left: "◀ Roll left", right: "Roll right ▶" },
    mode_id: "both",
    runtime_binding: {
      adapter: "teleop",
      target: "rotation",
      value_mapping: { mode: 0, target_topic: "/joystick_cartesian_command" },
      axis_mapping: ROTATION_AXES[robotFamily(robotName) ?? "explorer"],
      axis_deadzone: 0.2,
    },
  };
}

/** A pad moves the hand or turns it; each choice sets the axes and the words together. */
export const JOYSTICK_PURPOSES = [
  { id: "translation", label: "Move the hand", title: "Translation", settings: translationPadSettings },
  { id: "rotation", label: "Turn the hand (tilt and roll)", title: "Rotation", settings: rotationPadSettings },
] as const;

export const JOYSTICK_PURPOSE_KEYS = ["deadzone", "labels", "mode_id", "runtime_binding"] as const;

export function joystickPurposeOf(settings: Record<string, unknown>): string | null {
  const binding = settings.runtime_binding;
  const target = typeof binding === "object" && binding !== null ? (binding as Record<string, unknown>).target : null;
  return target === "translation" || target === "rotation" ? target : null;
}
