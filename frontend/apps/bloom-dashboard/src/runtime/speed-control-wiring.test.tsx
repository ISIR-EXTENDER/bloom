/**
 * @vitest-environment jsdom
 */
import type { RosTopicStatus } from "@bloom/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

const LINEAR_SPEED_TOPIC = "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed";
const ANGULAR_SPEED_TOPIC = "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed";

function createConfigurationClient() {
  return explorerManagerClient((bundle) => {
    // The continuous limits live on the bench layout; the operator's are segments.
    for (const profile of bundle.applications[0]?.profiles ?? []) {
      profile.preferred_control_layout_id = "manager_drive_bench";
    }
  });
}

function readyTopic(name: string, messageType: string): RosTopicStatus {
  return { name, message_type: messageType, publisher_count: 1, subscription_count: 1 };
}

function createRuntimeActionClient() {
  return {
    listRosTopicStatus: vi.fn(async () => [
      readyTopic(LINEAR_SPEED_TOPIC, "std_msgs/msg/Float64"),
      readyTopic(ANGULAR_SPEED_TOPIC, "std_msgs/msg/Float64"),
      readyTopic("/gripper_controller/commands", "std_msgs/msg/Float64MultiArray"),
      readyTopic("/mode_request", "std_msgs/msg/String"),
      readyTopic("/joystick_cartesian_command", "geometry_msgs/msg/TwistStamped"),
    ]),
    listRuntimeCapabilities: vi.fn(async () => ({
      capabilities: [
        { id: "command-dispatcher", available: true, detail: "Commands are published to ROS." },
        { id: "data-source", available: true, detail: "Topic subscriptions deliver live samples." },
        { id: "teleop-adapter", available: true, detail: "Teleop commands reach the manager." },
      ],
      command_frame_id: "base_link",
      command_frame_ids: ["base_link", "ft_frame", "hybrid_frame"],
      robot_name: "Explorer",
    })),
    publishRosTopic: vi.fn(async (request) => ({
      detail: "Published.",
      message_type: request.message_type,
      status: "published" as const,
      topic: request.topic,
    })),
  } satisfies RuntimeActionClient;
}

describe("the Explorer speed controls", () => {
  it("starts at the configured controller limits and publishes changes to qontrol", async () => {
    const user = userEvent.setup();
    const runtimeActionClient = createRuntimeActionClient();
    render(<App configurationClient={createConfigurationClient()} runtimeActionClient={runtimeActionClient} />);

    await user.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");

    const linearSpeed = await screen.findByRole("slider", { name: "Max linear speed" });
    expect(linearSpeed).toHaveAttribute("aria-valuenow", "0.15");
    expect(screen.getByText("0.15 m/s")).toBeVisible();
    expect(screen.getByRole("slider", { name: "Max angular speed" })).toHaveAttribute("aria-valuenow", "0.4");
    expect(screen.getByText("0.40 rad/s")).toBeVisible();
    await waitFor(() => expect(linearSpeed).toBeEnabled());

    linearSpeed.focus();
    await user.keyboard("{ArrowRight}");

    await waitFor(() =>
      expect(runtimeActionClient.publishRosTopic).toHaveBeenCalledWith({
        topic: LINEAR_SPEED_TOPIC,
        message_type: "std_msgs/msg/Float64",
        payload: { data: 0.165 },
      }),
    );
    expect(screen.getByText("0.165 m/s")).toBeVisible();
  });
});
