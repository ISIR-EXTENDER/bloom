import { isModeRequestTopic, normalizeModeRequest, readModeRequestData } from "./mode-request";
import { clamp } from "./numbers";
import { asRecord } from "./values";

// cartesian_manager's lasting behaviours: each replaces the other, passthrough ends both, each is declared by
// its behaviours.<name>.* parameters and reports itself on a topic that publishes only while it is active.
export type ManagerBehaviour = "intent_scaling" | "shared_control";

export const MANAGER_NODE = "/cartesian_manager";
export const INTENT_SCALE_TOPIC = "/cartesian_manager/intent_scale";
export const SHARED_CONTROL_CONFIDENCES_TOPIC = "/shared_control/confidences";
export const SHARED_CONTROL_GOALS_TOPIC = "/shared_control/goals";
export const SHARED_CONTROL_SOFT_GOAL_TOPIC = "/shared_control/soft_goal";
/** The frame the manager reads goals in; a goal in another frame is ignored, so Bloom does not draw it. */
export const SHARED_CONTROL_GOAL_FRAME = "base_link";

/** One parameter each behaviour always declares: known in the command state, the manager offers the behaviour. */
export const BEHAVIOUR_MARKER_PARAMETER: Readonly<Record<ManagerBehaviour, string>> = {
  intent_scaling: "behaviours.intent_scaling.min_scale",
  shared_control: "behaviours.shared_control.goal_match_distance",
};

const BEHAVIOUR_TOPICS: Readonly<Record<string, ManagerBehaviour>> = {
  [INTENT_SCALE_TOPIC]: "intent_scaling",
  [SHARED_CONTROL_CONFIDENCES_TOPIC]: "shared_control",
  [SHARED_CONTROL_GOALS_TOPIC]: "shared_control",
  [SHARED_CONTROL_SOFT_GOAL_TOPIC]: "shared_control",
};

/** The lasting behaviour a mode request asks for; passthrough, shaping and targets ask for none. */
export function behaviourOfModeRequest(mode: string | null | undefined): ManagerBehaviour | null {
  if (typeof mode !== "string") {
    return null;
  }
  const normalized = normalizeModeRequest(mode);
  if (normalized === "behaviour/intent_scaling") {
    return "intent_scaling";
  }
  if (normalized === "behaviour/shared_control" || normalized === "behaviour/shared_control/reset") {
    return "shared_control";
  }
  return null;
}

function behaviourOfParameter(parameter: unknown): ManagerBehaviour | null {
  if (typeof parameter !== "string") {
    return null;
  }
  if (parameter.startsWith("behaviours.intent_scaling.")) {
    return "intent_scaling";
  }
  return parameter.startsWith("behaviours.shared_control.") ? "shared_control" : null;
}

/**
 * The behaviour a widget depends on, or null. A button's mode request is resolved by the caller, which knows the
 * app's presets; a toggle's is its ON payload, a slider's its parameter, a reader's its topic.
 */
export function widgetBehaviour(
  widget: { kind: string; settings: Record<string, unknown> },
  modeRequest?: string | null,
): ManagerBehaviour | null {
  const settings = widget.settings;
  const topic = typeof settings.topic === "string" ? settings.topic : "";
  switch (widget.kind) {
    case "command-button":
      return behaviourOfModeRequest(
        modeRequest ?? (isModeRequestTopic(topic) ? readModeRequestData(settings.payload) : null),
      );
    case "toggle":
      return isModeRequestTopic(topic) ? behaviourOfModeRequest(readModeRequestData(settings.onPayload)) : null;
    case "slider": {
      const binding = asRecord(settings.runtime_binding);
      return binding.adapter === "parameter" ? behaviourOfParameter(asRecord(binding.value_mapping).parameter) : null;
    }
    case "confidence-bars":
      return "shared_control";
    case "gauge":
    case "plot":
    case "topic-plot":
    case "topic-echo":
    case "event-log":
      return BEHAVIOUR_TOPICS[topic] ?? null;
    default:
      return null;
  }
}

export type BehaviourAvailability = "available" | "unavailable" | "unknown";

/**
 * Whether the running manager declares a behaviour: its marker parameter is known in the command state. Before
 * the first snapshot nothing is known, which is unknown rather than missing.
 */
export function behaviourAvailability(
  behaviour: ManagerBehaviour,
  connected: boolean,
  isKnown: (key: string) => boolean,
): BehaviourAvailability {
  if (!connected) {
    return "unknown";
  }
  return isKnown(`param:${MANAGER_NODE}:${BEHAVIOUR_MARKER_PARAMETER[behaviour]}`) ? "available" : "unavailable";
}

/** The manager's own name for the entry that stands for "no goal", always first in its confidences. */
export const AGNOSTIC_GOAL_ID = "agnostic";

/**
 * The manager's `/shared_control/confidences`: a Float64MultiArray whose one dimension label lists the goal ids,
 * comma-separated, "agnostic" first. A missing or repeated label is made unique by the entry's index, so two bars
 * never share a name; a value that is not a finite number is left out.
 */
export function readConfidences(value: unknown): { id: string; value: number }[] {
  const record = asRecord(value);
  const data = Array.isArray(record.data) ? record.data : [];
  const dimensions = asRecord(record.layout).dim;
  const label = Array.isArray(dimensions) ? asRecord(dimensions[0]).label : undefined;
  const ids = typeof label === "string" ? label.split(",").map((id) => id.trim()) : [];
  const taken = new Set<string>();
  const goals: { id: string; value: number }[] = [];
  data.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return;
    }
    const wanted = ids[index] || `goal_${index}`;
    let id = wanted;
    for (let suffix = 2; taken.has(id); suffix += 1) {
      id = `${wanted} #${suffix}`;
    }
    taken.add(id);
    goals.push({ id, value: clamp(item, 0, 1) });
  });
  return goals;
}

/** Two readings the bars would draw the same: the same ids, and every value the same to the hundredth. */
export function sameConfidences(
  a: readonly { id: string; value: number }[],
  b: readonly { id: string; value: number }[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (goal, index) =>
        goal.id === b[index]?.id && Math.round(goal.value * 100) === Math.round((b[index]?.value ?? 0) * 100),
    )
  );
}
