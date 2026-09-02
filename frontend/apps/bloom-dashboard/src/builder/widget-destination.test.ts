import type { WidgetConfig } from "@bloom/api-client";
import { findInertSetting, resolveWidgetDestination } from "@bloom/widgets";
import { describe, expect, it } from "vitest";
import { resolveWidgetRuntimeTopic } from "../runtime/RuntimeWorkspace";
import { createTeleopCommandRequest, createValueTopicPublishRequest } from "../runtime/runtime-action-dispatcher";

/**
 * The inspector's explanation is only worth showing if it matches what the
 * runtime actually does. These tests drive the real dispatcher and the real
 * subscription resolver with the same settings and assert the panel agrees, so
 * a change to either side that makes the builder lie fails here.
 */
function valueChangeIntent(settings: Record<string, unknown>, value: unknown = 0.5) {
  return {
    type: "value-change" as const,
    widgetId: "widget",
    widgetKind: "slider" as const,
    value,
    topic: typeof settings.topic === "string" ? settings.topic : undefined,
    messageType: typeof settings.messageType === "string" ? settings.messageType : undefined,
    runtimeBinding: settings.runtime_binding,
  };
}

function widget(kind: string, settings: Record<string, unknown>): WidgetConfig {
  return {
    id: "widget",
    kind,
    title: kind,
    layout: { x: 0, y: 0, width: 10, height: 10 },
    settings,
  } as unknown as WidgetConfig;
}

describe("teleop widgets", () => {
  const settings = {
    topic: "/operator/typed/this",
    messageType: "std_msgs/msg/Float64",
    runtime_binding: {
      adapter: "teleop",
      axis_mapping: { value: { component: "linear_z" } },
      value_mapping: { target_topic: "/joystick_cartesian_command" },
    },
  };

  it("reports the binding topic, and the dispatcher agrees", () => {
    const destination = resolveWidgetDestination("joystick", settings);
    const request = createTeleopCommandRequest(valueChangeIntent(settings) as never);

    expect(destination?.topic).toBe("/joystick_cartesian_command");
    expect(destination?.source).toBe("runtime-binding");
    expect(request?.target).toBe(destination?.topic);
  });

  it("marks Output topic and message type as having no effect", () => {
    const destination = resolveWidgetDestination("joystick", settings);

    expect(findInertSetting(destination, "topic")?.reason).toMatch(/shared twist/);
    expect(findInertSetting(destination, "messageType")).toBeDefined();
  });

  it("falls back to the manager input, and the dispatcher agrees", () => {
    const withoutTarget = {
      ...settings,
      runtime_binding: { adapter: "teleop", axis_mapping: { value: { component: "linear_z" } } },
    };
    const destination = resolveWidgetDestination("slider", withoutTarget);
    const request = createTeleopCommandRequest(valueChangeIntent(withoutTarget) as never);

    expect(destination?.source).toBe("adapter-default");
    expect(request?.target).toBe(destination?.topic);
  });
});

describe("plain publishing widgets", () => {
  it("prefers the runtime binding, and the dispatcher agrees", () => {
    const settings = {
      topic: "/operator/typed/this",
      messageType: "std_msgs/msg/Float64",
      runtime_binding: { adapter: "topic", value_mapping: { target_topic: "/from/binding" } },
    };

    const destination = resolveWidgetDestination("slider", settings);
    const request = createValueTopicPublishRequest(valueChangeIntent(settings) as never);

    expect(destination?.topic).toBe("/from/binding");
    expect(destination?.source).toBe("runtime-binding");
    expect(request?.topic).toBe(destination?.topic);
  });

  it("marks a superseded Output topic as having no effect only when it holds a value", () => {
    const binding = { adapter: "topic", value_mapping: { target_topic: "/from/binding" } };

    const withValue = resolveWidgetDestination("slider", { topic: "/typed", runtime_binding: binding });
    const withoutValue = resolveWidgetDestination("slider", { runtime_binding: binding });

    expect(findInertSetting(withValue, "topic")).toBeDefined();
    expect(findInertSetting(withoutValue, "topic")).toBeUndefined();
  });

  it("uses Output topic when no binding sets one, and the dispatcher agrees", () => {
    const settings = { topic: "/cmd/max_velocity", messageType: "std_msgs/msg/Float64", runtime_binding: {} };

    const destination = resolveWidgetDestination("toggle", settings);
    const request = createValueTopicPublishRequest(valueChangeIntent(settings) as never);

    expect(destination?.source).toBe("output-topic");
    expect(request?.topic).toBe(destination?.topic);
  });

  it("reads a legacy binding target", () => {
    const destination = resolveWidgetDestination("command-button", {
      runtime_binding: { adapter: "topic", target: "/cmd/joystick_z" },
    });

    expect(destination?.topic).toBe("/cmd/joystick_z");
    expect(destination?.source).toBe("runtime-binding");
  });

  it("says plainly when nothing is configured", () => {
    const destination = resolveWidgetDestination("slider", {});

    expect(destination?.topic).toBeNull();
    expect(destination?.source).toBe("unset");
    expect(destination?.detail).toMatch(/publishes nothing/);
  });

  it("ignores a topic that is not a ROS topic path", () => {
    // A half-typed topic must not be reported as a working destination.
    expect(resolveWidgetDestination("slider", { topic: "joystick_cartesian_command" })?.source).toBe("unset");
  });
});

/**
 * A feedback widget subscribes; it never publishes. Describing one as
 * publishing would be the same class of mistake this panel exists to fix, and
 * would be a loud one on a screen echoing `/joystick_cartesian_command`.
 */
describe("reading widgets", () => {
  for (const kind of ["topic-echo", "topic-plot", "gauge", "plot", "event-log"]) {
    it(`says ${kind} reads rather than publishes, and the runtime subscribes there`, () => {
      const settings = { topic: "/joystick_cartesian_command", messageType: "geometry_msgs/msg/TwistStamped" };
      const destination = resolveWidgetDestination(kind, settings);

      expect(destination?.direction).toBe("reads");
      expect(destination?.detail).toBeNull();
      expect(resolveWidgetRuntimeTopic(widget(kind, settings))).toBe(destination?.topic);
    });
  }

  it("reports the joint state topic for a 3D robot view, and the runtime agrees", () => {
    const settings = { jointStateTopic: "/explorer/joint_states" };
    const destination = resolveWidgetDestination("robot-3d", settings);

    expect(destination?.topic).toBe("/explorer/joint_states");
    expect(resolveWidgetRuntimeTopic(widget("robot-3d", settings))).toBe(destination?.topic);
  });

  it("names the default joint state topic, and the runtime agrees", () => {
    const destination = resolveWidgetDestination("robot-3d", {});

    expect(destination?.source).toBe("widget-default");
    expect(destination?.detail).toMatch(/default when no joint state topic/);
    expect(resolveWidgetRuntimeTopic(widget("robot-3d", {}))).toBe(destination?.topic);
  });

  it("says plainly when no topic is set", () => {
    const destination = resolveWidgetDestination("topic-echo", {});

    expect(destination?.topic).toBeNull();
    expect(destination?.detail).toMatch(/receives nothing/);
  });

  it("never marks a reading widget's settings inert, because the runtime uses them", () => {
    const destination = resolveWidgetDestination("gauge", {
      topic: "/status",
      messageType: "std_msgs/msg/Float64",
      fieldPath: "data",
    });

    expect(destination?.inertSettings).toEqual([]);
  });
});

describe("widgets whose data flow is not modelled", () => {
  it("shows no panel rather than guessing", () => {
    // A camera reads a stream source, not a topic; a plain button carries no
    // topic at all. Inventing a line for these is what caused the confusion.
    expect(resolveWidgetDestination("camera", { topic: "/image_raw" })).toBeNull();
    expect(resolveWidgetDestination("button", {})).toBeNull();
    expect(resolveWidgetDestination("label", {})).toBeNull();
    expect(resolveWidgetDestination("unknown", {})).toBeNull();
  });
});

describe("malformed settings", () => {
  it("survives rather than throwing in the inspector", () => {
    expect(resolveWidgetDestination("slider", undefined)?.source).toBe("unset");
    expect(resolveWidgetDestination("slider", { runtime_binding: "nonsense" })?.source).toBe("unset");
    expect(resolveWidgetDestination("slider", { runtime_binding: { value_mapping: 42 } })?.source).toBe("unset");
    expect(resolveWidgetDestination("topic-echo", { topic: 42 })?.topic).toBeNull();
  });
});

/**
 * The legacy `binding` setting predates runtime bindings. It still does real
 * work on a joystick, where it is a fallback for the mode, the displayed
 * target and the default axis hints. On a slider nothing reads it: the
 * renderer ignores it, and the dispatcher ignores the copy it puts on the
 * intent. Offering it as an editable field beside the runtime binding that
 * does the work is what made this confusing.
 */
describe("the legacy binding setting", () => {
  it("is inert on a slider whatever else is configured", () => {
    for (const settings of [
      {},
      { binding: "input", topic: "/cmd/max_velocity" },
      { binding: "input", runtime_binding: { adapter: "topic", value_mapping: { target_topic: "/x" } } },
      { binding: "input", runtime_binding: { adapter: "teleop" } },
    ]) {
      const destination = resolveWidgetDestination("slider", settings);
      expect(findInertSetting(destination, "binding")?.reason).toMatch(/Nothing reads this on a slider/);
    }
  });

  it("is left alone on a joystick, where it still feeds the mode and axis hints", () => {
    const destination = resolveWidgetDestination("joystick", {
      binding: "rot",
      runtime_binding: { adapter: "teleop" },
    });

    expect(findInertSetting(destination, "binding")).toBeUndefined();
  });

  it("does not claim a slider's other settings are inert without cause", () => {
    const destination = resolveWidgetDestination("slider", { binding: "input", topic: "/cmd/max_velocity" });

    expect(findInertSetting(destination, "topic")).toBeUndefined();
    expect(findInertSetting(destination, "unit")).toBeUndefined();
    expect(findInertSetting(destination, "intent_label")).toBeUndefined();
  });
});
