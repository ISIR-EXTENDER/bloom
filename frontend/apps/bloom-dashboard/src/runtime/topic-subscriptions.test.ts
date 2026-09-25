import { describe, expect, it } from "vitest";

import type { RuntimeTopicSubscriptionRequest } from "./runtime-action-dispatcher";
import { planTopicSubscriptions } from "./topic-subscriptions";

const request = (widgetId: string, topic: string): RuntimeTopicSubscriptionRequest => ({
  type: "subscribe_topic",
  topic,
  message_type: "geometry_msgs/msg/TwistStamped",
  field_path: "",
  widget_id: `${widgetId}:${topic}`,
});

const feedback = [request("feedback-plot", "/ee_velocity"), request("feedback-plot", "/cartesian_command")];
const sources = [request("sources-plot", "/tablet_cartesian_command"), request("sources-plot", "/cartesian_command")];

describe("topic subscriptions across screens", () => {
  it("keeps a topic both screens plot and drops the one the new screen does not", () => {
    const opened = planTopicSubscriptions(new Map(), feedback, true);
    const switched = planTopicSubscriptions(opened.held, sources, true);

    expect(switched.subscribe.map((entry) => entry.topic)).toEqual(["/tablet_cartesian_command"]);
    expect(switched.unsubscribe).toEqual([request("feedback-plot", "/ee_velocity")]);
    expect([...switched.held.keys()].sort()).toEqual(["/cartesian_command", "/tablet_cartesian_command"]);
    // The kept subscription is still the one the backend knows, under its original widget id.
    expect(switched.held.get("/cartesian_command")?.widget_id).toBe("feedback-plot:/cartesian_command");
  });

  it("asks once per topic even when two widgets on a screen share it", () => {
    const plan = planTopicSubscriptions(new Map(), [...feedback, request("values", "/ee_velocity")], true);

    expect(plan.subscribe.map((entry) => entry.topic)).toEqual(["/ee_velocity", "/cartesian_command"]);
  });

  it("keeps holding what a client without unsubscribe cannot drop, so it never asks twice", () => {
    const opened = planTopicSubscriptions(new Map(), feedback, false);
    const switched = planTopicSubscriptions(opened.held, sources, false);
    const back = planTopicSubscriptions(switched.held, feedback, false);

    expect(switched.unsubscribe).toEqual([]);
    expect(switched.subscribe.map((entry) => entry.topic)).toEqual(["/tablet_cartesian_command"]);
    expect(back.subscribe).toEqual([]);
  });
});
