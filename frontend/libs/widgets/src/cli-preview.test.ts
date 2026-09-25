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
});
