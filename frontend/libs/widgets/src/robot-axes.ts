import { getDefaultWidgetSettings } from "./settings";
import { TELEOP_DEFAULT_TARGET } from "./widget-destination";

/**
 * Which way a translation pad moves each arm, as the Manager apps drive it.
 *
 * The Explorer's pad is the extender_ui profile (swap X and Y, invert linear X) that the sim check
 * `drive-controls-move-the-hand-as-labelled` holds to its words; the Kinova's is the identity.
 */
type AxisMapping = Record<"x" | "y", { component: string; scale?: number }>;

const TRANSLATION_AXES: Readonly<Record<string, AxisMapping>> = {
  explorer: { x: { component: "linear_y" }, y: { component: "linear_x", scale: -1 } },
  kinova: { x: { component: "linear_x" }, y: { component: "linear_y" } },
};

const DEFAULT_AXES = TRANSLATION_AXES.explorer as AxisMapping;

/** A joystick that moves the hand where its words say, on the arm this Bloom drives. */
export function translationPadSettings(robotName?: string): Record<string, unknown> {
  const axes = TRANSLATION_AXES[(robotName ?? "").trim().toLowerCase()] ?? DEFAULT_AXES;
  return {
    ...getDefaultWidgetSettings("joystick"),
    deadzone: 0,
    labels: { top: "▲ Forward", bottom: "▼ Back", left: "◀ Left", right: "Right ▶" },
    mode_id: "both",
    runtime_binding: {
      adapter: "teleop",
      target: "translation",
      value_mapping: { mode: 0, target_topic: TELEOP_DEFAULT_TARGET },
      axis_mapping: axes,
      axis_deadzone: 0.2,
    },
  };
}
