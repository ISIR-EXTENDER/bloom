import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { useEffect, useRef, useState } from "react";
import type { RuntimeActionClient, RuntimeTopicSubscriptionRequest } from "./runtime-action-dispatcher";
import { appendRuntimeTopicSample, createRuntimeTopicSubscriptionRequests } from "./runtime-topic-data";
import { type HeldTopicSubscriptions, planTopicSubscriptions } from "./topic-subscriptions";
import type { useRuntimeLinkState } from "./use-runtime-link-state";

type RuntimeTopicDataOptions = {
  onTopicSample?: RuntimeActionClient["addRuntimeTopicSampleListener"];
  onTopicSubscriptionRequest?: (request: RuntimeTopicSubscriptionRequest) => void;
  runtimeActionClient: RuntimeActionClient;
  runtimeLink: ReturnType<typeof useRuntimeLinkState>;
  screen: ScreenConfig;
};

/** What the screen's reading widgets hold: subscribed per topic while the socket is up, cleared on a new screen. */
export function useRuntimeTopicData({
  onTopicSample,
  onTopicSubscriptionRequest,
  runtimeActionClient,
  runtimeLink,
  screen,
}: RuntimeTopicDataOptions): Record<string, WidgetDataSnapshot> {
  const [dataByWidgetId, setDataByWidgetId] = useState<Record<string, WidgetDataSnapshot>>({});
  // A client that reports no link at all (previews, tests) subscribes once; a reporting one once per open socket.
  const topicSubscriptionsReady = !runtimeActionClient.addRuntimeLinkStateListener || runtimeLink.state === "connected";
  const heldTopicSubscriptionsRef = useRef<{ connectionCount?: number; held: HeldTopicSubscriptions }>({
    connectionCount: -1,
    held: new Map(),
  });
  const unsubscribeRuntimeTopic = runtimeActionClient.unsubscribeRuntimeTopic;

  useEffect(() => {
    if (!onTopicSubscriptionRequest || !topicSubscriptionsReady) {
      return;
    }

    // A reconnected socket is a new session with no subscriptions, so the
    // screen has to ask again or the telemetry stays blank behind a READY chip.
    const previous = heldTopicSubscriptionsRef.current;
    const connectionCount = runtimeLink.connectionCount;
    const plan = planTopicSubscriptions(
      previous.connectionCount === connectionCount ? previous.held : new Map(),
      createRuntimeTopicSubscriptionRequests(screen),
      Boolean(unsubscribeRuntimeTopic),
    );
    heldTopicSubscriptionsRef.current = { connectionCount, held: plan.held };
    for (const request of plan.unsubscribe) {
      unsubscribeRuntimeTopic?.({
        type: "unsubscribe_topic",
        topic: request.topic,
        widget_id: request.widget_id,
      }).catch(() => undefined);
    }
    for (const request of plan.subscribe) {
      onTopicSubscriptionRequest(request);
    }
  }, [
    onTopicSubscriptionRequest,
    runtimeLink.connectionCount,
    topicSubscriptionsReady,
    screen,
    unsubscribeRuntimeTopic,
  ]);

  const previousScreenIdRef = useRef(screen.id);
  useEffect(() => {
    if (previousScreenIdRef.current === screen.id) {
      return;
    }
    previousScreenIdRef.current = screen.id;
    setDataByWidgetId({});
  }, [screen.id]);

  useEffect(() => {
    if (!onTopicSample) {
      return;
    }

    return onTopicSample((sample) => {
      setDataByWidgetId((currentData) => appendRuntimeTopicSample(currentData, screen, sample));
    });
  }, [onTopicSample, screen]);

  return dataByWidgetId;
}
