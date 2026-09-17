import type { RuntimeTopicSubscriptionRequest } from "./runtime-action-dispatcher";

/** What this socket's session is subscribed to, by topic. */
export type HeldTopicSubscriptions = ReadonlyMap<string, RuntimeTopicSubscriptionRequest>;

export type TopicSubscriptionPlan = {
  held: HeldTopicSubscriptions;
  subscribe: RuntimeTopicSubscriptionRequest[];
  unsubscribe: RuntimeTopicSubscriptionRequest[];
};

/**
 * Samples are routed by topic alone, so one subscription per topic serves every screen: a second would deliver
 * each message twice. Topics the screen no longer shows are dropped when the client can drop them.
 */
export function planTopicSubscriptions(
  held: HeldTopicSubscriptions,
  wanted: readonly RuntimeTopicSubscriptionRequest[],
  canUnsubscribe: boolean,
): TopicSubscriptionPlan {
  const wantedByTopic = new Map<string, RuntimeTopicSubscriptionRequest>();
  for (const request of wanted) {
    if (!wantedByTopic.has(request.topic)) {
      wantedByTopic.set(request.topic, request);
    }
  }

  const next = new Map(held);
  const unsubscribe = canUnsubscribe ? [...held.values()].filter((request) => !wantedByTopic.has(request.topic)) : [];
  for (const request of unsubscribe) {
    next.delete(request.topic);
  }
  const subscribe = [...wantedByTopic.values()].filter((request) => !held.has(request.topic));
  for (const request of subscribe) {
    next.set(request.topic, request);
  }
  return { held: next, subscribe, unsubscribe };
}
