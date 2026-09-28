import {
  INTENT_SCALE_TOPIC,
  SHARED_CONTROL_CONFIDENCES_TOPIC,
  SHARED_CONTROL_GOALS_TOPIC,
  SHARED_CONTROL_SOFT_GOAL_TOPIC,
} from "@bloom/widgets";
import {
  INTENT_SCALING_ACTIVE_KEY,
  knownValue,
  managerKey,
  SHARED_CONTROL_ACTIVE_KEY,
  useCommandState,
} from "./command-state";

const ACTIVE_KEY_BY_TOPIC: Readonly<Record<string, string>> = {
  [INTENT_SCALE_TOPIC]: INTENT_SCALING_ACTIVE_KEY,
  [SHARED_CONTROL_CONFIDENCES_TOPIC]: SHARED_CONTROL_ACTIVE_KEY,
  [SHARED_CONTROL_GOALS_TOPIC]: SHARED_CONTROL_ACTIVE_KEY,
  [SHARED_CONTROL_SOFT_GOAL_TOPIC]: SHARED_CONTROL_ACTIVE_KEY,
};

/**
 * Whether the manager reports the behaviour a feedback topic belongs to (ADR 0142: the backend measures it from
 * the topic's own liveness). True or false once known; null for another topic, or before the store has said.
 */
export function useBehaviourReported(topic: string): boolean | null {
  const key = ACTIVE_KEY_BY_TOPIC[topic] ?? null;
  const entry = knownValue(useCommandState(key));
  return entry === null ? null : entry.value === true;
}

/** Whether the store knows the manager to be in a behaviour other than shared control. */
export function useOtherBehaviourKnown(): boolean {
  const behaviour = knownValue(useCommandState(managerKey("behaviour")));
  return behaviour !== null && behaviour.value !== "behaviour/shared_control";
}
