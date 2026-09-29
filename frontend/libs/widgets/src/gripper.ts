import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { MOTION_PROFILES } from "./motion-verdict";
import { type RobotFamily, robotFamily } from "./robot-family";
import type { ToggleSettings } from "./settings";

/**
 * The gripper command, in one place.
 *
 * `cartesian_manager` leaves the gripper to its own controller: a `Float64MultiArray` on
 * `/gripper_controller/commands`, the same contract `tablet_interface` publishes. The two arms travel
 * different distances, so the pair of numbers is per robot and nothing else about the command changes.
 */
const GRIPPER_COMMAND_TOPIC = "/gripper_controller/commands";
const GRIPPER_MESSAGE_TYPE = "std_msgs/msg/Float64MultiArray";

type GripperCalibration = { closed: number; open: number };

/** Explorer matches tablet_interface; the Kinova pair is the Robotiq 85 knuckle joint's own range. */
const GRIPPER_CALIBRATIONS: Readonly<Record<RobotFamily, GripperCalibration>> = {
  explorer: MOTION_PROFILES.explorer.gripper,
  kinova: MOTION_PROFILES.kinova.gripper,
};

function gripperCalibrationFor(robotName: string | undefined): GripperCalibration {
  return GRIPPER_CALIBRATIONS[robotFamily(robotName) ?? "explorer"];
}

/**
 * A toggle that drives the gripper without the author writing anything.
 *
 * The labels name what the press will do and the state labels name what was commanded, which is the
 * rule the operator glossary and the shipped seeds already follow.
 */
export function gripperToggleSettings(robotName?: string): ToggleSettings {
  const calibration = gripperCalibrationFor(robotName);
  return {
    initialValue: false,
    messageType: GRIPPER_MESSAGE_TYPE,
    // On is the closed state: pressing "Close gripper" turns it on and commands the closed value, as the Manager seeds do.
    offLabel: "Close gripper",
    offPayload: `{data: [${calibration.open}]}`,
    offStateLabel: "open",
    onLabel: "Open gripper",
    onPayload: `{data: [${calibration.closed}]}`,
    onStateLabel: "closed",
    show_details: false,
    topic: GRIPPER_COMMAND_TOPIC,
  } as ToggleSettings;
}

const SHIPPED_PAYLOAD = /^\s*\{\s*data\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*\]\s*\}\s*$/;

/** The robot's own value for a value some shipped calibration sends; any other value is the author's and is kept. */
function gripperValueFor(value: number, robotName: string | null | undefined): number {
  const family = robotFamily(robotName);
  if (!family) {
    return value;
  }
  for (const calibration of Object.values(GRIPPER_CALIBRATIONS)) {
    if (value === calibration.open) return GRIPPER_CALIBRATIONS[family].open;
    if (value === calibration.closed) return GRIPPER_CALIBRATIONS[family].closed;
  }
  return value;
}

/** A `{data: [x]}` payload, as a toggle writes it or as a preset stores it, with x moved to the robot's value. */
function gripperPayloadFor(payload: unknown, robotName: string | null | undefined): unknown {
  if (typeof payload === "string") {
    const match = SHIPPED_PAYLOAD.exec(payload);
    if (!match) {
      return payload;
    }
    const value = gripperValueFor(Number(match[1]), robotName);
    // Written as the Manager seeds write it: 0.0, not 0.
    return `{data: [${Number.isInteger(value) ? value.toFixed(1) : value}]}`;
  }
  const data = (payload as { data?: unknown } | null)?.data;
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "number") {
    return { ...(payload as object), data: [gripperValueFor(data[0], robotName)] };
  }
  return payload;
}

function gripperSettingsFor(settings: Record<string, unknown>, robotName: string | null | undefined) {
  if (settings.topic !== GRIPPER_COMMAND_TOPIC) {
    return settings;
  }
  return {
    ...settings,
    ...("onPayload" in settings ? { onPayload: gripperPayloadFor(settings.onPayload, robotName) } : {}),
    ...("offPayload" in settings ? { offPayload: gripperPayloadFor(settings.offPayload, robotName) } : {}),
    ...("payload" in settings ? { payload: gripperPayloadFor(settings.payload, robotName) } : {}),
  };
}

/** One screen's gripper controls with the running robot's pair; the screen itself when nothing changes. */
export function withRobotGripperScreen(screen: ScreenConfig, robotName: string | null | undefined): ScreenConfig {
  if (!robotFamily(robotName) || !screen.widgets.some((widget) => widget.settings.topic === GRIPPER_COMMAND_TOPIC)) {
    return screen;
  }
  return {
    ...screen,
    widgets: screen.widgets.map((widget) => ({ ...widget, settings: gripperSettingsFor(widget.settings, robotName) })),
  };
}

/**
 * An app written for one arm drives the gripper of the arm it runs on: a gripper toggle or preset that sends a
 * shipped calibration (Explorer 1.1/0.2, Kinova 0.8/0.0) sends this robot's pair instead. Without a known robot,
 * or with values of the author's own, nothing changes. The runtime renders its screen apart from its app: both
 * need it (withRobotGripperScreen).
 */
export function withRobotGripper(
  application: ApplicationConfig,
  robotName: string | null | undefined,
): ApplicationConfig {
  if (!robotFamily(robotName)) {
    return application;
  }
  return {
    ...application,
    action_presets: application.action_presets.map((preset) =>
      preset.topic === GRIPPER_COMMAND_TOPIC && !preset.payload_text
        ? { ...preset, payload: gripperPayloadFor(preset.payload, robotName) }
        : preset,
    ),
    screens: application.screens.map((screen) => withRobotGripperScreen(screen, robotName)),
  };
}
