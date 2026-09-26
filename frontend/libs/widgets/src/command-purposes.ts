import { robotFamily } from "./robot-family";
import { asRecord } from "./values";

/**
 * What a command button can do on the manager stack, each as the shipped Manager apps write it. Anything but
 * Neutral needed the mode string, and a frame button a `runtime_binding`, typed by hand.
 */
export type CommandPurpose = {
  id: string;
  label: string;
  title: string;
  settings: () => Record<string, unknown>;
};

const MODE = { topic: "/mode_request", messageType: "std_msgs/msg/String" };
const mode =
  (command: string, buttonLabel: string, extra: Record<string, unknown> = {}) =>
  () => ({
    ...MODE,
    action_label: `Request ${command}`,
    button_label: buttonLabel,
    command,
    payload: { data: command },
    ...extra,
  });
const frame = (frameId: string, buttonLabel: string) => () => ({
  action_label: `Stamp commands in ${frameId}`,
  button_label: buttonLabel,
  runtime_binding: { adapter: "teleop-frame", frame_id: frameId },
});

export const COMMAND_PURPOSES: readonly CommandPurpose[] = [
  { id: "neutral", label: "Neutral: both shapers off", title: "Neutral", settings: mode("geometric/both", "Neutral") },
  { id: "jaco", label: "Jaco mode", title: "Jaco", settings: mode("geometric/jaco", "Jaco") },
  {
    id: "snake-hold",
    label: "Snake while held",
    title: "Snake",
    settings: mode("geometric/snake", "Hold snake", {
      momentary: true,
      pressed_label: "SNAKE ON",
      released_label: "Hold snake",
      releasedPayload: { data: "geometric/both" },
    }),
  },
  {
    id: "go-home",
    label: "Go home (asks for a second press)",
    title: "Go home",
    settings: mode("behaviour/joint_target/home", "Send Home", {
      confirm_press: true,
      confirm_label: "Press again to move",
      confirm_timeout_seconds: 5,
      hint: "dispatched once — no progress is reported",
    }),
  },
  {
    id: "release",
    label: "Cancel a pose in progress",
    title: "Release",
    settings: mode("behaviour/passthrough", "Cancel the pose", { variant: "danger" }),
  },
  { id: "frame-base", label: "Drive in the base frame", title: "Base", settings: frame("base_link", "Base") },
  { id: "frame-tool", label: "Drive in the tool frame", title: "Tool", settings: frame("effector_frame", "Tool") },
  {
    id: "frame-hybrid",
    label: "Drive in the hybrid frame",
    title: "Hybrid",
    settings: frame("hybrid_frame", "Hybrid"),
  },
];

/** The keys a purpose owns: switching replaces all of them, so a Go home confirm never lingers on Neutral. */
export const COMMAND_PURPOSE_KEYS = [
  "action_feedback",
  "action_id",
  "action_label",
  "button_label",
  "command",
  "confirm_label",
  "confirm_press",
  "confirm_timeout_seconds",
  "hint",
  "messageType",
  "momentary",
  "payload",
  "presetId",
  "pressed_label",
  "released_label",
  "releasedPayload",
  "runtime_binding",
  "targetScreenId",
  "topic",
  "variant",
] as const;

/**
 * The purposes this arm can use. Go home is left out on the Kinova while cartesian_manager#10 is open: its home
 * target has six joints for a seven-joint arm and one past the gen3 limit, and the Kinova Manager app omits it.
 */
export function commandPurposesFor(robotName?: string | null): readonly CommandPurpose[] {
  return robotFamily(robotName) === "kinova"
    ? COMMAND_PURPOSES.filter((purpose) => purpose.id !== "go-home")
    : COMMAND_PURPOSES;
}

export function commandPurposeOf(settings: Record<string, unknown>): string | null {
  const binding = asRecord(settings.runtime_binding);
  if (binding.adapter === "teleop-frame") {
    return (
      { base_link: "frame-base", effector_frame: "frame-tool", hybrid_frame: "frame-hybrid" }[
        String(binding.frame_id)
      ] ?? null
    );
  }
  if (settings.topic !== "/mode_request") {
    return null;
  }
  const byCommand: Record<string, string> = {
    "geometric/both": "neutral",
    "geometric/jaco": "jaco",
    "geometric/snake": "snake-hold",
    "behaviour/joint_target/home": "go-home",
    "behaviour/passthrough": "release",
  };
  return byCommand[String(settings.command)] ?? null;
}
