/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, RuntimeActionPreset, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { buildCliPreview, COMMAND_PURPOSES, createWidgetActionIntent } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchRuntimeActionIntent, type RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import {
  applyRuntimeModeIntent,
  createDefaultRuntimeModeState,
  createRuntimeControlStateByWidgetId,
} from "../runtime/runtimeModeState";
import { BuilderGuidedTour, evaluateBuilderTour } from "./BuilderGuidedTour";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { WidgetDestinationSummary } from "./BuilderWidgetSummaries";
import { resolveWidgetRoute } from "./widget-publish-route";

const preset = (overrides: Partial<RuntimeActionPreset>): RuntimeActionPreset => ({
  command: "geometric/both",
  description: "",
  id: "neutral",
  kind: "topic-publish",
  message_type: "std_msgs/msg/String",
  name: "Neutral shaping",
  payload: { data: "geometric/both" },
  payload_text: "",
  tags: [],
  topic: "/mode_request",
  ...overrides,
});
const neutral = preset({});
const home = preset({
  command: "behaviour/joint_target/home",
  id: "home",
  name: "Home",
  payload: { data: "behaviour/joint_target/home" },
});
const resetFault = preset({
  command: "kinova.reset_fault",
  id: "reset-fault",
  kind: "service-call",
  message_type: "example_interfaces/srv/Trigger",
  name: "Reset fault",
  payload: null,
  topic: "/fault_controller/reset_fault",
});
const presets = [neutral, home, resetFault];

const purposeSettings = (id: string) => COMMAND_PURPOSES.find((purpose) => purpose.id === id)?.settings() ?? {};

const widget = (kind: string, settings: Record<string, unknown>, title = "Button", id = "button") =>
  ({ id, kind, layout: { height: 120, width: 220, x: 0, y: 0 }, settings, title }) as unknown as WidgetConfig;
const button = (settings: Record<string, unknown>, title?: string) => widget("command-button", settings, title);

const appWith = (widgets: WidgetConfig[], policy: Record<string, string[]> = {}) =>
  ({
    action_presets: presets,
    id: "app",
    name: "App",
    profiles: [],
    runtime_policy: {
      allowed_message_types: [],
      allowed_publish_topics: [],
      allowed_recording_topics: [],
      allowed_service_calls: ["/fault_controller/reset_fault"],
      allowed_teleop_targets: [],
      ...policy,
    },
    screens: [
      { canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, id: "screen", title: "Screen", widgets },
    ],
  }) as unknown as ApplicationConfig;

function renderEditor(target: WidgetConfig) {
  const onUpdateSettings = vi.fn((_settings: Record<string, unknown>, _title?: string) => null);
  render(
    <BuilderWidgetSettingsEditor
      actionPresets={presets}
      onUpdateSettings={onUpdateSettings}
      onUpdateTitle={vi.fn()}
      widget={target}
    />,
  );
  return {
    lastSaved: () => onUpdateSettings.mock.lastCall?.[0] ?? {},
    lastTitle: () => onUpdateSettings.mock.lastCall?.[1],
  };
}

function publishingClient() {
  const publishRosTopic = vi.fn(async (request: { message_type: string; topic: string }) => ({
    detail: "Published.",
    message_type: request.message_type,
    status: "published" as const,
    topic: request.topic,
  }));
  return { client: { publishRosTopic } as unknown as RuntimeActionClient, publishRosTopic };
}

afterEach(cleanup);

describe("an older button saved with its own topic and a preset", () => {
  // The old Builder kept Jaco's topic and payload beside a picked "home": one tap moved the arm home.
  const jaco = button({ ...purposeSettings("jaco"), presetId: home.id }, "Jaco");

  it("sends its own topic, and the inspector, CLI line, checklist and highlight all say so", async () => {
    const { client, publishRosTopic } = publishingClient();
    const intent = createWidgetActionIntent(jaco, { type: "press" });
    await dispatchRuntimeActionIntent(client, intent, { actionPresets: presets });
    expect(publishRosTopic).toHaveBeenCalledOnce();
    expect(publishRosTopic.mock.calls[0]?.[0]).toMatchObject({
      payload: { data: "geometric/jaco" },
      topic: "/mode_request",
    });

    expect(resolveWidgetRoute(jaco, presets)?.destination).toMatchObject({
      source: "output-topic",
      topic: "/mode_request",
    });
    expect(buildCliPreview("command-button", jaco.settings, jaco.settings.payload, presets)).toContain(
      "geometric/jaco",
    );

    const modeState = applyRuntimeModeIntent(createDefaultRuntimeModeState(), intent, presets);
    expect(modeState.requestedMode).toBe("geometric/jaco");
    const states = createRuntimeControlStateByWidgetId(
      { id: "screen", widgets: [jaco] } as unknown as ScreenConfig,
      modeState,
      { actionPresets: presets },
    );
    expect(states.button?.selection).toBe("selected");

    renderEditor(jaco);
    expect(screen.getByText(/The press sends its own topic \/mode_request, not the preset/)).toBeTruthy();
    expect(evaluateBuilderTour(appWith([jaco])).topics).toBe(false);
  });

  it("still sends the preset in the shape the Builder saves now", async () => {
    const saved = button({ command: home.command, presetId: home.id });
    const { client, publishRosTopic } = publishingClient();
    await dispatchRuntimeActionIntent(client, createWidgetActionIntent(saved, { type: "press" }), {
      actionPresets: presets,
    });
    expect(publishRosTopic.mock.calls[0]?.[0]).toMatchObject({ payload: { data: "behaviour/joint_target/home" } });
    expect(buildCliPreview("command-button", saved.settings, undefined, presets)).toBe(
      'ros2 topic pub -1 /mode_request std_msgs/msg/String "{\\"data\\":\\"behaviour/joint_target/home\\"}"',
    );
    expect(evaluateBuilderTour(appWith([saved])).topics).toBe(true);
  });
});

describe("the requested mode", () => {
  it("is what the resolved preset sent, not the button's own command", () => {
    const intent = createWidgetActionIntent(button({ command: "geometric/jaco", presetId: neutral.id }), {
      type: "press",
    });
    expect(applyRuntimeModeIntent(createDefaultRuntimeModeState(), intent, presets).requestedMode).toBe(
      "geometric/both",
    );
  });
});

describe("picking a preset", () => {
  it("renames a button that only named its purpose, and keeps one the author named", () => {
    const { lastSaved, lastTitle } = renderEditor(button(purposeSettings("neutral"), "Neutral"));
    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: resetFault.id } });
    expect(lastSaved().button_label).toBe("Reset fault");
    expect(lastTitle()).toBe("Reset fault");
    cleanup();

    const custom = renderEditor(button({ ...purposeSettings("neutral"), button_label: "Stop shaping" }, "My stop"));
    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: resetFault.id } });
    expect(custom.lastSaved().button_label).toBe("Stop shaping");
    expect(custom.lastTitle()).toBeUndefined();
  });
});

describe("Hold to run without a topic of its own", () => {
  it("cannot be ticked, and a saved one is flagged in the inspector and the checklist", () => {
    for (const settings of [purposeSettings("frame-tool"), { command: "kinova.reset_fault" }]) {
      renderEditor(button(settings));
      const hold = screen.getByRole("checkbox", { name: /Hold to run/ }) as HTMLInputElement;
      expect(hold.disabled).toBe(true);
      expect(screen.getByText(/set both under Advanced \(ROS\) first/)).toBeTruthy();
      cleanup();
    }

    const saved = button({ command: "kinova.reset_fault", momentary: true });
    renderEditor(saved);
    expect(screen.getByText(/it has no topic, so holding it sends nothing/)).toBeTruthy();
    expect(evaluateBuilderTour(appWith([saved])).topics).toBe(false);
  });

  it("holds the button's own topic when an older app also names a preset", () => {
    const held = button({ ...purposeSettings("snake-hold"), presetId: neutral.id });
    expect(resolveWidgetRoute(held, presets)?.destination.source).toBe("output-topic");
    renderEditor(held);
    expect(screen.getByText(/A held button sends only its own topic \/mode_request, never the preset/)).toBeTruthy();
    expect(screen.queryByText(/a held preset sends nothing/)).toBeNull();
  });

  it("warns when a hold off /mode_request has nothing to send on release", () => {
    renderEditor(
      button({ messageType: "std_msgs/msg/Bool", momentary: true, payload: { data: true }, topic: "/pump" }),
    );
    expect(screen.getByText(/Hold to run sends nothing on \/pump when it is let go/)).toBeTruthy();
  });
});

describe("a publisher that would fail at press time", () => {
  it("follows the new topic's type when the author did not type one", () => {
    const { lastSaved } = renderEditor(button(purposeSettings("jaco")));
    fireEvent.click(screen.getByText("Advanced (ROS)"));
    fireEvent.change(screen.getByLabelText("Output topic"), { target: { value: "/gripper_controller/commands" } });
    fireEvent.blur(screen.getByLabelText("Output topic"));
    expect(lastSaved()).toMatchObject({
      messageType: "std_msgs/msg/Float64MultiArray",
      topic: "/gripper_controller/commands",
    });
  });

  it("is flagged for a missing type, a type its topic does not carry, and a toggle with no payloads", () => {
    const cases: Array<[WidgetConfig, RegExp]> = [
      [button({ command: "go", payload: { data: "go" }, topic: "/custom" }), /\/custom has no message type here/],
      [
        button({ ...purposeSettings("jaco"), topic: "/gripper_controller/commands" }),
        /carries std_msgs\/msg\/Float64MultiArray, but this control sends std_msgs\/msg\/String/,
      ],
      [
        widget("toggle", { messageType: "std_msgs/msg/Float64MultiArray", topic: "/gripper_controller/commands" }),
        /no ON payload/,
      ],
    ];
    for (const [target, problem] of cases) {
      renderEditor(target);
      expect(screen.getByText(problem)).toBeTruthy();
      expect(evaluateBuilderTour(appWith([target])).topics).toBe(false);
      cleanup();
    }
  });
});

describe("a joystick target the robot's server refuses", () => {
  it("offers no Allow in this app", () => {
    const pad = widget("joystick", {
      runtime_binding: { adapter: "teleop", value_mapping: { target_topic: "/other_twist" } },
    });
    render(
      <WidgetDestinationSummary
        allowedTeleopTargets={["/joystick_cartesian_command"]}
        destination={resolveWidgetRoute(pad, [])?.destination ?? null}
        onAllow={vi.fn()}
        serverTeleopTargets={["/joystick_cartesian_command"]}
        widget={pad}
      />,
    );
    expect(screen.getByText(/Nothing on this robot takes a joystick on \/other_twist/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Allow/ })).toBeNull();
  });
});

describe("the checklist and the deployment's allowlists", () => {
  const gripper = widget("toggle", {
    messageType: "std_msgs/msg/Float64MultiArray",
    offPayload: "{data: [0.0]}",
    onPayload: "{data: [1.1]}",
    topic: "/gripper_controller/commands",
  });

  it("fails the topics step on a publish the robot refuses", () => {
    const app = appWith([gripper], { allowed_publish_topics: ["/gripper_controller/commands"] });
    expect(evaluateBuilderTour(app).topics).toBe(true);
    expect(evaluateBuilderTour(app, [], { publishTopics: ["/mode_request"] }).topics).toBe(false);
    expect(evaluateBuilderTour(app, [], { publishTopics: ["/gripper_controller/"] }).topics).toBe(true);

    render(
      <BuilderGuidedTour
        application={app}
        deployment={{ publishTopics: ["/mode_request"] }}
        onClose={vi.fn()}
        onOpenConfiguration={vi.fn()}
        onOpenScreenBuilder={vi.fn()}
        onPreviewRuntime={vi.fn()}
        selection={{ appId: "app", configId: "config", screenId: "screen" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Bind to allowed topics/ }));
    expect(screen.getByText(/this robot refuses publishing on \/gripper_controller\/commands/)).toBeTruthy();
  });
});
