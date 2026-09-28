import { gripperToggleSettings } from "./gripper";
import { isModeRequestTopic, normalizeModeRequest, readModeRequestData } from "./mode-request";

/**
 * What a toggle can switch on the manager stack, each as the shipped Manager apps write it. The gripper is what
 * the palette places; the two behaviours are the manager's lasting modes, off again on behaviour/passthrough.
 */
type TogglePurpose = {
  id: "gripper" | "intent-scaling" | "shared-control";
  label: string;
  title: string;
  settings: (robotName?: string) => Record<string, unknown>;
};

const modeToggle = (mode: string, onLabel: string, offLabel: string) => () => ({
  topic: "/mode_request",
  messageType: "std_msgs/msg/String",
  initialValue: false,
  onLabel,
  offLabel,
  onPayload: `{data: '${mode}'}`,
  offPayload: "{data: 'behaviour/passthrough'}",
});

export const TOGGLE_PURPOSES: readonly TogglePurpose[] = [
  {
    id: "gripper",
    label: "Gripper open and close",
    title: "Gripper",
    settings: (robotName) => ({ ...gripperToggleSettings(robotName) }),
  },
  {
    id: "intent-scaling",
    label: "Speed up with intent (behaviour/intent_scaling)",
    title: "Speed up with intent",
    settings: modeToggle("behaviour/intent_scaling", "Speeding up", "Plain speed"),
  },
  {
    id: "shared-control",
    label: "Assist to goals (behaviour/shared_control)",
    title: "Assist to goals",
    settings: modeToggle("behaviour/shared_control", "Assisting", "Not assisting"),
  },
];

/** The keys a purpose owns: switching replaces all of them, so a gripper state label never lingers on a mode. */
export const TOGGLE_PURPOSE_KEYS = [
  "initialValue",
  "messageType",
  "offLabel",
  "offPayload",
  "offStateLabel",
  "onLabel",
  "onPayload",
  "onStateLabel",
  "presetId",
  "runtime_binding",
  "topic",
] as const;

/** Which purpose a toggle already has, read from where it sends; null for anything else. */
export function togglePurposeOf(settings: Record<string, unknown>): TogglePurpose["id"] | null {
  if (settings.topic === "/gripper_controller/commands") {
    return "gripper";
  }
  if (!isModeRequestTopic(settings.topic as string)) {
    return null;
  }
  const on = readModeRequestData(settings.onPayload);
  const off = readModeRequestData(settings.offPayload);
  if (on === null || off === null || normalizeModeRequest(off) !== "behaviour/passthrough") {
    return null;
  }
  const mode = normalizeModeRequest(on);
  return mode === "behaviour/intent_scaling"
    ? "intent-scaling"
    : mode === "behaviour/shared_control"
      ? "shared-control"
      : null;
}
