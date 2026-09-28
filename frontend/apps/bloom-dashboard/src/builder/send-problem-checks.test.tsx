/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import { COMMAND_PURPOSES, commandPurposeOf, createWidgetActionIntent } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateBuilderTour } from "./BuilderGuidedTour";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { WidgetCliPreview } from "./BuilderWidgetSummaries";
import { describeWidgetFrameProblem, describeWidgetSendProblems } from "./widget-send-problems";

afterEach(cleanup);

const widget = (kind: string, settings: Record<string, unknown>, id = "w") =>
  ({ id, kind, layout: { height: 120, width: 220, x: 40, y: 40 }, settings, title: id }) as unknown as WidgetConfig;
const button = (settings: Record<string, unknown>, id = "b") => widget("command-button", settings, id);
const purpose = (id: string) => COMMAND_PURPOSES.find((candidate) => candidate.id === id)?.settings() ?? {};

function app(
  widgets: WidgetConfig[],
  policy: Partial<ApplicationConfig["runtime_policy"]> = {},
  presets: RuntimeActionPreset[] = [],
): ApplicationConfig {
  return {
    action_presets: presets,
    description: "",
    id: "app",
    name: "App",
    profiles: [],
    runtime_policy: {
      allowed_message_types: [],
      allowed_publish_topics: [],
      allowed_recording_topics: [],
      allowed_service_calls: [],
      allowed_teleop_targets: ["/joystick_cartesian_command"],
      command_frame_id: "base_link",
      ...policy,
    },
    screens: [
      { canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, id: "main", title: "Main", widgets },
      { canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, id: "other", title: "Other", widgets: [] },
    ],
  } as unknown as ApplicationConfig;
}

describe("a held String button with a command and no payload", () => {
  const held = button({
    command: "geometric/snake",
    messageType: "std_msgs/msg/String",
    momentary: true,
    payload: "",
    releasedPayload: { data: "geometric/both" },
    topic: "/mode_request",
  });

  it("shows the command it sends on the Held line", () => {
    render(<WidgetCliPreview widget={held} />);
    expect(screen.getByText(/Held: ros2 topic pub -1 \/mode_request std_msgs\/msg\/String/).textContent).toContain(
      "geometric/snake",
    );
  });

  it("passes the checklist", () => {
    expect(evaluateBuilderTour(app([held])).topics).toBe(true);
  });
});

describe("a teleop-frame button", () => {
  const tool = button(purpose("frame-tool"), "tool");

  it("is flagged when the robot's report leaves its frame out, and not without a report", () => {
    const frames = ["base_link", "hybrid_frame"];
    expect(describeWidgetFrameProblem(tool, frames)).toMatch(/switches to effector_frame, which this robot/);
    expect(describeWidgetSendProblems(tool, [], { commandFrameIds: frames }).join(" ")).toMatch(/effector_frame/);
    expect(evaluateBuilderTour(app([tool]), [], { commandFrameIds: frames }).frame).toBe(false);
    expect(evaluateBuilderTour(app([tool])).frame).toBe(true);
    expect(evaluateBuilderTour(app([tool]), [], { commandFrameIds: [...frames, "effector_frame"] }).frame).toBe(true);
  });

  it("is flagged when the app's or the server's teleop list refuses the manager's input", () => {
    expect(evaluateBuilderTour(app([tool], { allowed_teleop_targets: [] })).topics).toBe(false);
    expect(evaluateBuilderTour(app([tool]), [], { teleopTargets: ["/other"] }).topics).toBe(false);
    expect(describeWidgetSendProblems(tool, [], { appTeleopTargets: [] }).join(" ")).toMatch(
      /not allowed by this app's teleop list/,
    );
  });

  it("counts as a destination: a screen of frame buttons passes the topics step", () => {
    expect(evaluateBuilderTour(app([tool, button(purpose("frame-base"), "base")])).topics).toBe(true);
  });
});

describe("the mode-request grammar", () => {
  const mode = (command: string, extra: Record<string, unknown> = {}) =>
    button({
      command,
      messageType: "std_msgs/msg/String",
      payload: { data: command },
      topic: "/mode_request",
      ...extra,
    });

  it.each([
    ["a geometric typo", mode("geometric/snek"), /unknown geometric mode 'snek'/],
    ["a joint target without a name", mode("behaviour/joint_target"), /needs a target name/],
    ["a navigate command published", mode("navigate_screen"), /needs at least two segments/],
    ["a namespaced topic", mode("behavior/passthrough", { topic: "/arm/mode_request" }), /unknown mode family/],
  ])("flags %s", (_name, target, pattern) => {
    expect(describeWidgetSendProblems(target, []).join(" ")).toMatch(pattern);
    expect(evaluateBuilderTour(app([target])).topics).toBe(false);
  });

  it("takes what the manager normalizes", () => {
    expect(describeWidgetSendProblems(mode("Geometric/Both"), [])).toEqual([]);
    expect(describeWidgetSendProblems(mode("behaviour/pose-target/ready"), [])).toEqual([]);
  });

  it("checks the preset a press sends and a toggle's ON and OFF", () => {
    const typo: RuntimeActionPreset = {
      command: "snake",
      description: "",
      id: "snake",
      kind: "topic-publish",
      message_type: "std_msgs/msg/String",
      name: "Snake",
      payload: null,
      payload_text: "{data: 'geometric/snek'}",
      tags: [],
      topic: "/mode_request",
    };
    const viaPreset = button({ presetId: "snake" });
    expect(describeWidgetSendProblems(viaPreset, [typo]).join(" ")).toMatch(/"geometric\/snek"/);
    expect(evaluateBuilderTour(app([viaPreset], {}, [typo])).topics).toBe(false);

    const toggle = widget("toggle", {
      messageType: "std_msgs/msg/String",
      offPayload: { data: "geometric/both" },
      onPayload: { data: "geometric/snakes" },
      topic: "/mode_request",
    });
    expect(describeWidgetSendProblems(toggle, []).join(" ")).toMatch(/switching it on is refused/);
  });

  it("says a navigation button with no screen sends its command and is refused", () => {
    const lost = button({ command: "navigate_screen" });
    expect(describeWidgetSendProblems(lost, []).join(" ")).toMatch(
      /sends navigate_screen to the robot, which refuses it/,
    );
  });
});

describe("the Open a screen purpose", () => {
  it("writes the navigation command, clears the topic, and shows the screen picker", () => {
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>, _title?: string) => null);
    const mode = button({ ...purpose("jaco") });
    const { rerender } = render(
      <BuilderWidgetSettingsEditor
        appScreens={[{ id: "other", title: "Other" }]}
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={vi.fn()}
        widget={mode}
      />,
    );
    fireEvent.change(screen.getByLabelText("What this button does"), { target: { value: "navigate" } });
    const saved = onUpdateSettings.mock.lastCall?.[0] ?? {};
    expect(saved).toMatchObject({ command: "navigate_screen" });
    expect(saved).not.toHaveProperty("topic");
    expect(saved).not.toHaveProperty("payload");
    expect(saved).not.toHaveProperty("messageType");
    expect(commandPurposeOf(saved)).toBe("navigate");

    rerender(
      <BuilderWidgetSettingsEditor
        appScreens={[{ id: "other", title: "Other" }]}
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={vi.fn()}
        widget={button(saved)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Opens screen"), { target: { value: "other" } });
    const picked = button(onUpdateSettings.mock.lastCall?.[0] ?? {});
    expect(createWidgetActionIntent(picked, { type: "press" })).toMatchObject({
      targetScreenId: "other",
      type: "screen-navigation",
    });
    expect(evaluateBuilderTour(app([picked])).topics).toBe(true);
  });
});

describe("the checklist and the robot's own refusals", () => {
  const speed = widget("slider", {
    max: 1,
    messageType: "std_msgs/msg/Float64",
    min: 0,
    step: 0.1,
    topic: "/explorer_user_interfaces/max_linear_speed",
  });

  it("fails a speed-limit slider past the server's cap", () => {
    expect(describeWidgetSendProblems(speed, []).join(" ")).toMatch(/refuses a speed limit above 0.3/);
    expect(evaluateBuilderTour(app([speed])).topics).toBe(false);
    expect(evaluateBuilderTour(app([speed]), [], { speedLimitCaps: { angular: 0.8, linear: 1 } }).topics).toBe(true);
  });

  it("fails pose targets on a Kinova and lets Go home through since cartesian_manager#11", () => {
    const home = button(purpose("go-home"));
    const pose = button({
      ...purpose("jaco"),
      command: "behaviour/pose_target/ready",
      payload: { data: "behaviour/pose_target/ready" },
    });
    expect(describeWidgetSendProblems(pose, [], { robotName: "Kinova Gen3" }).join(" ")).toMatch(
      /not available on the Kinova/,
    );
    expect(evaluateBuilderTour(app([pose]), [], { robotName: "gen3" }).topics).toBe(false);
    expect(evaluateBuilderTour(app([pose]), [], { robotName: "Explorer" }).topics).toBe(true);
    expect(describeWidgetSendProblems(home, [], { robotName: "Kinova Gen3" })).toEqual([]);
    expect(evaluateBuilderTour(app([home]), [], { robotName: "gen3" }).topics).toBe(true);
  });
});

describe("a toggle whose ON or OFF payload was emptied", () => {
  it("is flagged whatever its message type", () => {
    const toggle = widget("toggle", {
      messageType: "std_msgs/msg/Bool",
      offPayload: { data: false },
      onPayload: "",
      topic: "/ui/lamp",
    });
    expect(describeWidgetSendProblems(toggle, [])).toContain(
      "This toggle has no ON payload, so switching it on sends nothing.",
    );
    expect(evaluateBuilderTour(app([toggle])).topics).toBe(false);
  });
});
