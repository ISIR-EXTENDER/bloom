import type { RuntimeActionPreset } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import { buildCliPreview } from "./cli-preview";
import { gripperToggleSettings } from "./gripper";

describe("the command line a control is equivalent to", () => {
  it("writes the gripper toggle as a line someone can paste", () => {
    const settings = gripperToggleSettings("Explorer") as unknown as Record<string, unknown>;

    expect(buildCliPreview("toggle", settings, settings.onPayload)).toBe(
      'ros2 topic pub -1 /gripper_controller/commands std_msgs/msg/Float64MultiArray "{data: [1.1]}"',
    );
  });

  it("says nothing when there is nothing to send yet", () => {
    expect(buildCliPreview("toggle", { topic: "", messageType: "" }, "")).toBeNull();
    expect(buildCliPreview("command-button", { topic: "/x" }, "{data: true}")).toBeNull();
  });

  it("stays quiet for a control that only reads", () => {
    expect(
      buildCliPreview("topic-echo", { topic: "/joint_states", messageType: "sensor_msgs/msg/JointState" }, ""),
    ).toBeNull();
  });

  it("escapes a quoted payload so the line survives being pasted", () => {
    const line = buildCliPreview(
      "command-button",
      { topic: "/mode_request", messageType: "std_msgs/msg/String" },
      "{data: 'geometric/both'}",
    );

    expect(line).toContain("/mode_request");
    expect(line).toContain("geometric/both");
  });

  it("follows the preset the dispatcher sends, and the button's own topic when an older app saved both", () => {
    const home = {
      command: "behaviour/joint_target/home",
      description: "",
      id: "home",
      kind: "topic-publish" as const,
      message_type: "std_msgs/msg/String",
      name: "Home",
      payload: { data: "behaviour/joint_target/home" },
      payload_text: "",
      tags: [],
      topic: "/mode_request",
    };
    expect(buildCliPreview("command-button", { command: home.command, presetId: "home" }, undefined, [home])).toContain(
      "behaviour/joint_target/home",
    );

    const jaco = {
      command: "geometric/jaco",
      messageType: "std_msgs/msg/String",
      payload: { data: "geometric/jaco" },
      presetId: "home",
      topic: "/mode_request",
    };
    expect(buildCliPreview("command-button", jaco, jaco.payload, [home])).toContain("geometric/jaco");
  });
});

describe("what a String button with no payload sends", () => {
  const settings = {
    command: "geometric/jaco",
    messageType: "std_msgs/msg/String",
    payload: "",
    topic: "/mode_request",
  };

  it("shows the command it sends as the data", () => {
    expect(buildCliPreview("command-button", settings, settings.payload)).toBe(
      'ros2 topic pub -1 /mode_request std_msgs/msg/String "{\\"data\\":\\"geometric/jaco\\"}"',
    );
  });

  it("shows the command for a held one too, which the renderer sends as the data", () => {
    expect(buildCliPreview("command-button", { ...settings, momentary: true }, settings.payload)).toBe(
      'ros2 topic pub -1 /mode_request std_msgs/msg/String "{\\"data\\":\\"geometric/jaco\\"}"',
    );
  });
});

describe("a toggle with its own topic and a parameter binding", () => {
  it("shows the topic it publishes, not the parameter", () => {
    const settings = {
      messageType: "std_msgs/msg/Bool",
      offPayload: { data: false },
      onPayload: { data: true },
      runtime_binding: { adapter: "parameter", value_mapping: { node: "/cartesian_manager", parameter: "x" } },
      topic: "/ui/visual_servoing/on",
    };
    expect(buildCliPreview("toggle", settings, settings.onPayload)).toBe(
      'ros2 topic pub -1 /ui/visual_servoing/on std_msgs/msg/Bool "{\\"data\\":true}"',
    );
  });
});

describe("a button sending a service-call preset", () => {
  const gripper: RuntimeActionPreset = {
    command: "gripper.enable",
    description: "",
    id: "gripper-enable",
    kind: "service-call",
    message_type: "std_srvs/srv/SetBool",
    name: "Enable gripper",
    payload: null,
    payload_text: "{data: true}",
    tags: [],
    topic: "/gripper/enable",
  };
  const press = (preset: RuntimeActionPreset) =>
    buildCliPreview("command-button", { command: preset.command, presetId: preset.id }, undefined, [preset]);

  it("is the ros2 service call line with its request fields", () => {
    expect(press(gripper)).toBe('ros2 service call /gripper/enable std_srvs/srv/SetBool "{data: true}"');
  });

  it("sends an empty request when the preset has no fields, and escapes quotes in stored ones", () => {
    expect(press({ ...gripper, message_type: "std_srvs/srv/Trigger", payload_text: "" })).toBe(
      'ros2 service call /gripper/enable std_srvs/srv/Trigger "{}"',
    );
    expect(press({ ...gripper, payload: { data: true }, payload_text: "" })).toBe(
      'ros2 service call /gripper/enable std_srvs/srv/SetBool "{\\"data\\":true}"',
    );
  });

  it("shows nothing when the service or its type is missing", () => {
    expect(press({ ...gripper, topic: "" })).toBeNull();
    expect(press({ ...gripper, message_type: "" })).toBeNull();
  });
});
