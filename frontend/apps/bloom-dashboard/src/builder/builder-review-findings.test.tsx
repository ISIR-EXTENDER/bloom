/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { createWidgetActionIntent, resolveCommandPayload, resolveWidgetDestination } from "@bloom/widgets";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AxisMappingEditor } from "./AxisMappingEditor";
import { BuilderAppScreensPanel } from "./BuilderAppScreensPanel";
import { evaluateBuilderTour } from "./BuilderGuidedTour";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { resolveWidgetRoute } from "./widget-publish-route";
import { describeWidgetFrameProblem, describeWidgetSendProblems } from "./widget-send-problems";

afterEach(cleanup);

function widget(kind: string, settings: Record<string, unknown>, id = "w"): WidgetConfig {
  return {
    id,
    kind,
    title: id,
    layout: { x: 40, y: 40, width: 320, height: 400 },
    settings,
  } as unknown as WidgetConfig;
}

function app(widgets: WidgetConfig[], extra: Partial<ApplicationConfig> = {}): ApplicationConfig {
  return {
    id: "app",
    name: "App",
    description: "",
    action_presets: [],
    runtime_policy: {
      command_frame_id: "base_link",
      allowed_message_types: [],
      allowed_publish_topics: [],
      allowed_recording_topics: [],
      allowed_service_calls: [],
      allowed_parameters: ["/cartesian_manager:*"],
      allowed_teleop_targets: ["/joystick_cartesian_command"],
    },
    profiles: [],
    screens: [
      { id: "main", title: "Main", canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets },
      { id: "other", title: "Other", canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets: [] },
    ],
    ...extra,
  } as unknown as ApplicationConfig;
}

const PARAMETER_BINDING = {
  adapter: "parameter",
  target: "parameter",
  value_mapping: { node: "/cartesian_manager", parameter: "inputs.joystick.enabled" },
};

describe("a toggle's destination", () => {
  const gripper = {
    messageType: "std_msgs/msg/Float64MultiArray",
    offPayload: "{data: [0.0]}",
    onPayload: "{data: [1.1]}",
    runtime_binding: PARAMETER_BINDING,
    topic: "/gripper_controller/commands",
  };

  it("is its own topic when it has one, as createToggleIntent sends", () => {
    const toggle = widget("toggle", gripper);
    const intent = createWidgetActionIntent(toggle, { nextState: "on", type: "toggle" });
    const route = resolveWidgetRoute(toggle, []);

    expect(intent).toMatchObject({ topic: "/gripper_controller/commands", type: "topic-publish" });
    expect(route?.destination.topic).toBe("/gripper_controller/commands");
    expect(route?.parameter).toBeNull();
    expect(route?.messageType).toBe("std_msgs/msg/Float64MultiArray");
  });

  it("says the binding beside its own topic is ignored", () => {
    expect(describeWidgetSendProblems(widget("toggle", gripper), [])).toContain(
      "This toggle publishes /gripper_controller/commands; its runtime binding is ignored. Clear the topic or the binding.",
    );
  });

  it("is still the parameter when there is no topic, and says nothing", () => {
    const toggle = widget("toggle", { runtime_binding: PARAMETER_BINDING });
    expect(resolveWidgetRoute(toggle, [])?.parameter).toBe("/cartesian_manager:inputs.joystick.enabled");
    expect(describeWidgetSendProblems(toggle, [])).toEqual([]);
  });

  it("names a binding the runtime cannot send", () => {
    const toggle = widget("toggle", { runtime_binding: { adapter: "topic", target: "/ui/x" } });
    expect(createWidgetActionIntent(toggle, { nextState: "on", type: "toggle" }).type).toBe("toggle-state");
    expect(resolveWidgetDestination("toggle", toggle.settings)?.topic).toBeNull();
    expect(describeWidgetSendProblems(toggle, [])[0]).toMatch(/sends nothing/);
  });
});

describe("a held String button with no payload", () => {
  const held = widget("command-button", {
    command: "geometric/snake",
    messageType: "std_msgs/msg/String",
    momentary: true,
    payload: "",
    releasedPayload: { data: "geometric/both" },
    topic: "/mode_request",
  });

  it("passes: the hold sends its command as the data, as the renderer does", () => {
    expect(resolveCommandPayload(held.settings, "std_msgs/msg/String")).toEqual({ data: "geometric/snake" });
    expect(describeWidgetSendProblems(held, [])).toEqual([]);
  });

  it("is flagged when it has no command either", () => {
    const bare = widget("command-button", { ...held.settings, command: "" });
    expect(describeWidgetSendProblems(bare, []).join(" ")).toMatch(/no payload and no command/);
  });
});

describe("value widgets typed with a message the server refuses", () => {
  const slider = (settings: Record<string, unknown>) =>
    widget("slider", { max: 1, min: 0, step: 0.1, topic: "/ui/value", ...settings });

  it.each([
    ["a String slider", slider({ messageType: "std_msgs/msg/String" }), /does not take/],
    ["a Bool slider", slider({ messageType: "std_msgs/msg/Bool" }), /does not take/],
    ["an Int32 slider with a fractional step", slider({ messageType: "std_msgs/msg/Int32" }), /whole numbers/],
    ["a Float64 gesture pad", widget("gesture-pad", { messageType: "std_msgs/msg/Float64", topic: "/ui/g" }), /text/],
    ["a Bool gesture pad", widget("gesture-pad", { messageType: "std_msgs/msg/Bool", topic: "/ui/g" }), /text/],
  ])("flags %s", (_name, value, pattern) => {
    expect(describeWidgetSendProblems(value, []).join(" ")).toMatch(pattern);
    expect(evaluateBuilderTour(app([value])).topics).toBe(false);
  });

  it.each([
    ["a Float64 slider", slider({ messageType: "std_msgs/msg/Float64" })],
    ["a Float32 slider", slider({ messageType: "std_msgs/msg/Float32" })],
    ["an Int32 slider with a whole step", slider({ max: 10, messageType: "std_msgs/msg/Int32", step: 1 })],
    ["a String gesture pad", widget("gesture-pad", { messageType: "std_msgs/msg/String", topic: "/ui/g" })],
  ])("passes %s", (_name, value) => {
    expect(describeWidgetSendProblems(value, [])).toEqual([]);
  });
});

describe("a parameter slider the server bounds", () => {
  const bound = (parameter: string, settings: Record<string, unknown>, node = "/cartesian_manager") =>
    widget("slider", {
      step: 0.1,
      runtime_binding: { adapter: "parameter", target: "parameter", value_mapping: { node, parameter } },
      ...settings,
    });

  it("warns when the range goes past the server's bound", () => {
    const [problem] = describeWidgetSendProblems(
      bound("rate_limiter.max_linear_acceleration", { max: 10, min: 0.5 }),
      [],
    );
    expect(problem).toMatch(/from 0 to 6 .*Maximum \(10\)/);
  });

  it("warns when a max velocity or acceleration can reach zero", () => {
    const [problem] = describeWidgetSendProblems(bound("shapers.jaco.max_angular_velocity", { max: 1, min: 0 }), []);
    expect(problem).toMatch(/above 0.*Minimum \(0\)/);
  });

  it("warns on a Petanque throw angle past half a radian", () => {
    const angle = bound("angle_between_start_and_finish", { max: 1.57, min: -1.57 }, "/petanque_throw");
    expect(describeWidgetSendProblems(angle, [])[0]).toMatch(/from -0.5 to 0.5/);
  });

  it("says nothing inside the bounds", () => {
    expect(describeWidgetSendProblems(bound("rate_limiter.max_linear_acceleration", { max: 6, min: 0.5 }), [])).toEqual(
      [],
    );
    expect(describeWidgetSendProblems(bound("shapers.snake.gain", { max: 10, min: 0 }), [])).toEqual([]);
  });
});

describe("a widget whose settings fail normalization", () => {
  it("is flagged, because the runtime sends nothing for it", () => {
    const broken = widget("slider", { max: 0, min: 1, step: 0.1, topic: "/ui/value" });
    expect(createWidgetActionIntent(broken, { type: "set-value", value: 0.5 }).type).toBe("unsupported");
    expect(describeWidgetSendProblems(broken, [])[0]).toMatch(/invalid .*sends nothing/);
    expect(evaluateBuilderTour(app([broken])).topics).toBe(false);
  });
});

describe("navigation buttons", () => {
  const nav = (targetScreenId?: string) =>
    widget("command-button", { command: "navigate_screen", ...(targetScreenId ? { targetScreenId } : {}) }, "home");

  it("flags a target the app does not have, in the inspector and the checklist", () => {
    const application = app([nav("gone")]);
    expect(describeWidgetSendProblems(nav("gone"), [], { screens: application.screens })[0]).toMatch(
      /opens screen "gone", which this app does not have/,
    );
    expect(evaluateBuilderTour(application).topics).toBe(false);
  });

  it("flags a navigation button with no target", () => {
    expect(describeWidgetSendProblems(nav(), [], { screens: [] })[0]).toMatch(/opens no screen/);
  });

  it("passes when the target is one of the app's screens", () => {
    expect(evaluateBuilderTour(app([nav("other")])).topics).toBe(true);
  });

  it("offers the app's screens under Opens screen, and keeps a missing target visible", () => {
    render(
      <BuilderWidgetSettingsEditor
        appScreens={[
          { id: "main", title: "Main" },
          { id: "other", title: "Other" },
        ]}
        onUpdateSettings={vi.fn(() => null)}
        onUpdateTitle={vi.fn()}
        widget={nav("gone")}
      />,
    );
    const picker = screen.getByLabelText("Opens screen") as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      "Choose a screen",
      "Main",
      "Other",
      "gone (not in this app)",
    ]);
    expect(picker.value).toBe("gone");
  });

  it("is flagged when the screen it opens is removed, and left as it is", () => {
    const screens = app([nav("other")]).screens.filter((candidate) => candidate.id !== "other") as ScreenConfig[];
    render(
      <BuilderAppScreensPanel
        isDirty={false}
        isSaving={false}
        newScreenDevice="tablet"
        newScreenName=""
        onAddScreen={vi.fn()}
        onAddScreenById={vi.fn()}
        onCreateScreen={vi.fn()}
        onDuplicateScreen={vi.fn()}
        onMoveScreenBefore={vi.fn()}
        onNewScreenDeviceChange={vi.fn()}
        onNewScreenNameChange={vi.fn()}
        onOpenScreenBuilder={vi.fn()}
        onRemoveScreen={vi.fn()}
        onRenameScreen={vi.fn()}
        onReorderScreen={vi.fn()}
        screens={screens}
        unassignedScreens={[]}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/home on Main \(opens "other"\)/);
  });
});

describe("read-only apps in the review checklist", () => {
  it("pass touch and topics with a camera alone", () => {
    const camera = widget("camera", { source: "webcam" }, "camera");
    const checks = evaluateBuilderTour(app([camera]));
    expect(checks.touch).toBe(true);
    expect(checks.topics).toBe(true);
  });

  it("still fail an app with nothing placed", () => {
    const checks = evaluateBuilderTour(app([]));
    expect(checks.touch).toBe(false);
    expect(checks.topics).toBe(false);
  });
});

describe("command frames", () => {
  const pad = widget("joystick", {
    runtime_binding: {
      adapter: "teleop",
      target: "teleop",
      axis_mapping: { x: { component: "angular_z" } },
      value_mapping: { frame_id: "camera_frame", target_topic: "/joystick_cartesian_command" },
    },
  });

  it("flags a pad frame the robot does not accept", () => {
    expect(describeWidgetFrameProblem(pad, ["base_link", "effector_frame"])).toMatch(/camera_frame.*blocked/);
    expect(describeWidgetFrameProblem(pad, undefined)).toBeNull();
    expect(evaluateBuilderTour(app([pad]), [], { commandFrameIds: ["base_link"] }).frame).toBe(false);
  });

  it("checks the app's frame against the robot's", () => {
    expect(evaluateBuilderTour(app([]), [], { commandFrameIds: ["base_link"] }).frame).toBe(true);
    expect(evaluateBuilderTour(app([]), [], { commandFrameIds: ["world"] }).frame).toBe(false);
  });

  it("shows the pad's actual frame in the select, and why it is blocked", () => {
    render(
      <AxisMappingEditor allowedCommandFrameIds={["base_link"]} onUpdateSettings={vi.fn(() => null)} widget={pad} />,
    );
    expect((screen.getByLabelText("Turns in") as HTMLSelectElement).value).toBe("camera_frame");
    expect(screen.getByRole("alert").textContent).toMatch(/camera_frame, which this robot does not accept/);
  });
});
