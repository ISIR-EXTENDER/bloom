import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { describe, expect, it } from "vitest";
import { appendRuntimeTopicSample, createRuntimeTopicSubscriptionRequests } from "./runtime-topic-data";

const widget = (id: string, kind: string, settings: Record<string, unknown>): WidgetConfig =>
  ({ id, kind, title: id, layout: { x: 0, y: 0, width: 200, height: 100 }, settings }) as unknown as WidgetConfig;

const screen: ScreenConfig = {
  id: "readers",
  title: "Readers",
  canvas: { preset_id: "hd", runtime_mode: "fit" },
  widgets: [
    widget("echo", "topic-echo", { topic: "/mode_request", messageType: "std_msgs/msg/String", maxMessages: 2 }),
    widget("table", "joint-table", { topic: "/joint_states", messageType: "sensor_msgs/msg/JointState" }),
    widget("jac", "jacobian", { topic: "/jacobian", messageType: "std_msgs/msg/Float64MultiArray" }),
    widget("log", "event-log", {
      topic: "/rosout",
      messageType: "rcl_interfaces/msg/Log",
      fieldPath: "msg",
      maxEntries: 2,
    }),
    widget("tplot", "topic-plot", { topic: "/height", messageType: "std_msgs/msg/Float64", maxSamples: 2 }),
    widget("gauge", "gauge", { topic: "/height", messageType: "std_msgs/msg/Float64" }),
    widget("plot", "plot", {
      topic: "/ee_pose",
      messageType: "geometry_msgs/msg/PoseStamped",
      fieldPath: "pose.position.z",
    }),
    widget("lib", "position-library", { jointNames: ["j2", "j1"] }),
    widget("any", "position-library", {}),
  ],
};

const sample = (topic: string, value: unknown, receivedAt = "2026-09-29T10:00:00.000Z") =>
  ({ type: "topic_sample", payload: { received_at: receivedAt, topic, value, widget_id: "" } }) as never;

describe("subscriptions for the reading widgets", () => {
  it("names each widget's topic and type, with joint states for the position library", () => {
    const requests = createRuntimeTopicSubscriptionRequests(screen).map((request) => [
      request.topic,
      request.message_type,
    ]);
    expect(requests).toContainEqual(["/mode_request", "std_msgs/msg/String"]);
    expect(requests).toContainEqual(["/joint_states", "sensor_msgs/msg/JointState"]);
    // One subscription per widget: the gauge and the topic plot each read /height on their own.
    expect(requests.filter(([topic]) => topic === "/height")).toHaveLength(2);
  });
});

describe("what each reader keeps", () => {
  it("keeps an echo's last few messages, newest last, and a table or jacobian only the newest", () => {
    let data = appendRuntimeTopicSample({}, screen, sample("/mode_request", { data: "a" }));
    data = appendRuntimeTopicSample(data, screen, sample("/mode_request", { data: "b" }));
    data = appendRuntimeTopicSample(data, screen, sample("/mode_request", { data: "c" }));
    const echo = data.echo;
    expect(
      echo?.type === "topic-echo" && echo.messages.map((message) => (message.value as { data: string }).data),
    ).toEqual(["b", "c"]);

    data = appendRuntimeTopicSample(data, screen, sample("/joint_states", { name: ["j1"], position: [1] }));
    data = appendRuntimeTopicSample(data, screen, sample("/joint_states", { name: ["j1"], position: [2] }));
    const table = data.table;
    expect(table?.type === "topic-echo" && table.messages).toHaveLength(1);
    expect(table?.type === "topic-echo" && table.messages[0]?.value).toEqual({ name: ["j1"], position: [2] });
    data = appendRuntimeTopicSample(data, screen, sample("/jacobian", { data: [1, 2] }));
    expect(data.jac?.type).toBe("topic-echo");
  });

  it("keeps a log's newest entries and a topic plot's last samples within its window", () => {
    let data = appendRuntimeTopicSample({}, screen, sample("/rosout", { msg: "one" }));
    data = appendRuntimeTopicSample(data, screen, sample("/rosout", { msg: "two" }));
    data = appendRuntimeTopicSample(data, screen, sample("/rosout", { msg: "three" }));
    const log = data.log;
    // The log keeps the field it was pointed at, not the whole message.
    expect(log?.type === "event-log" && log.messages.map((message) => message.value)).toEqual(["two", "three"]);

    data = appendRuntimeTopicSample(data, screen, sample("/height", { data: 0.1 }, "2026-09-29T10:00:00.000Z"));
    data = appendRuntimeTopicSample(data, screen, sample("/height", { data: 0.2 }, "2026-09-29T10:00:01.000Z"));
    data = appendRuntimeTopicSample(data, screen, sample("/height", { data: 0.3 }, "2026-09-29T10:00:02.000Z"));
    const plot = data.tplot;
    expect(plot?.type === "topic-plot" && plot.samples.map((point) => point.value)).toEqual([0.2, 0.3]);
  });

  it("reads a gauge's newest value and skips a sample its field cannot be read from", () => {
    const data = appendRuntimeTopicSample({}, screen, sample("/height", { data: 0.4 }));
    expect(data.gauge).toMatchObject({ type: "gauge", topic: "/height", value: 0.4 });
    const unreadable = appendRuntimeTopicSample(data, screen, sample("/height", { text: "no number" }));
    expect(unreadable.gauge).toBe(data.gauge);
  });

  it("plots a nested field of a pose", () => {
    let data = appendRuntimeTopicSample({}, screen, sample("/ee_pose", { pose: { position: { z: 0.25 } } }));
    data = appendRuntimeTopicSample(
      data,
      screen,
      sample("/ee_pose", { pose: { position: { z: 0.5 } } }, "2026-09-29T10:00:01.000Z"),
    );
    const plot = data.plot;
    expect(plot?.type === "plot" && plot.samples.map((point) => point.value)).toEqual([0.25, 0.5]);
  });

  it("gives the position library the joints in its own order, and no pose at all when one is missing", () => {
    const complete = appendRuntimeTopicSample(
      {},
      screen,
      sample("/joint_states", { name: ["j1", "j2"], position: [0.1, 0.2] }),
    );
    expect(complete.lib).toMatchObject({
      type: "position-library",
      saved: [],
      joints: { names: ["j2", "j1"], positions: [0.2, 0.1], receivedAt: "2026-09-29T10:00:00.000Z" },
    });
    // An unconfigured library takes the sample as it comes.
    expect(complete.any).toMatchObject({ joints: { names: ["j1", "j2"], positions: [0.1, 0.2] } });

    const partial = appendRuntimeTopicSample(
      complete,
      screen,
      sample("/joint_states", { name: ["j1"], position: [0.3] }),
    );
    // Capturing a pose from half the joints would save a pose nobody can drive to.
    expect(partial.lib).toBe(complete.lib);
    expect(partial.any).toMatchObject({ joints: { names: ["j1"], positions: [0.3] } });

    const mismatched = appendRuntimeTopicSample(
      complete,
      screen,
      sample("/joint_states", { name: ["j1", "j2"], position: [0.3] }),
    );
    expect(mismatched.any).toBe(complete.any);
    const nan = appendRuntimeTopicSample(
      complete,
      screen,
      sample("/joint_states", { name: ["j1", "j2"], position: [0.3, "x"] }),
    );
    expect(nan.lib).toBe(complete.lib);
  });

  it("keeps the saved poses a library already shows when a new joint state arrives", () => {
    const shown: Record<string, WidgetDataSnapshot> = {
      lib: {
        type: "position-library" as const,
        saved: [{ name: "home", jointNames: ["j1", "j2"], positions: [0, 0] }],
      },
    };
    const data = appendRuntimeTopicSample(
      shown,
      screen,
      sample("/joint_states", { name: ["j1", "j2"], position: [0.1, 0.2] }),
    );
    expect(data.lib).toMatchObject({ saved: (shown.lib as { saved: unknown }).saved, joints: { names: ["j2", "j1"] } });
  });
});
