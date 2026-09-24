import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { useEffect, useRef, useState } from "react";
import type {
  RuntimeActionClient,
  RuntimeTopicSampleMessage,
  RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";
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

/** About one screen frame. */
const SAMPLE_BATCH_MS = 16;
/** Samples kept while a batch waits; beyond it the oldest go, which only a hidden tab reaches. */
const SAMPLE_QUEUE_LIMIT = 600;

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

    // One state update per frame for everything that arrived, not one per sample: sixty samples a
    // second re-rendered the whole runtime sixty times. A hidden tab's timer runs about once a second,
    // and the queue keeps only the newest samples so it cannot grow without bound meanwhile.
    const queue: RuntimeTopicSampleMessage[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const batch = queue.splice(0);
      if (batch.length === 0) {
        return;
      }
      setDataByWidgetId((currentData) =>
        batch.reduce((data, sample) => appendRuntimeTopicSample(data, screen, sample), currentData),
      );
    };
    const stop = onTopicSample((sample) => {
      queue.push(sample);
      if (queue.length > SAMPLE_QUEUE_LIMIT) {
        queue.splice(0, queue.length - SAMPLE_QUEUE_LIMIT);
      }
      timer ??= setTimeout(flush, SAMPLE_BATCH_MS);
    });
    return () => {
      clearTimeout(timer);
      queue.length = 0;
      stop();
    };
  }, [onTopicSample, screen]);

  return dataByWidgetId;
}
