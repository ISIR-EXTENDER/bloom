/**
 * @vitest-environment jsdom
 */
import type { RosTopicStatus } from "@bloom/api-client";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import widgetLabConfiguration from "../../../../../backend/seed/applications/widget-lab.json";
import { App } from "../App";
import { seededConfigurationClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

const GRIPPER = "/gripper_controller/commands";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

function readyTopic(name: string, messageType: string): RosTopicStatus {
  return { name, message_type: messageType, publisher_count: 1, subscription_count: 1 };
}

function runtimeClientFor(robotName: string) {
  return {
    listRosTopicStatus: vi.fn(async () => [
      readyTopic(GRIPPER, "std_msgs/msg/Float64MultiArray"),
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
      command_frame_ids: ["base_link"],
      robot_name: robotName,
    })),
    publishRosTopic: vi.fn(async (request) => ({
      detail: "Published.",
      message_type: request.message_type,
      status: "published" as const,
      topic: request.topic,
    })),
  } satisfies RuntimeActionClient;
}

// The Widget Lab is written with the Explorer's pair; what reaches the API must be the running arm's.
describe("the Widget Lab gripper on the arm the API names", () => {
  for (const [robotName, closed] of [
    ["Kinova", "0.8"],
    ["Explorer", "1.1"],
  ] as const) {
    it(`${robotName}: Close gripper publishes [${closed}]`, async () => {
      const user = userEvent.setup();
      const client = runtimeClientFor(robotName);
      render(
        <App
          configurationClient={seededConfigurationClient("widget-lab", widgetLabConfiguration)}
          runtimeActionClient={client}
        />,
      );
      await user.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
      await openRuntimeApp("Widget Lab");
      // Wait for the capability report, so the press is measured against the robot it names.
      await waitFor(() => expect(client.listRuntimeCapabilities).toHaveBeenCalled());
      const close = await screen.findByRole("button", { name: /^Gripper: Close gripper/ });
      await waitFor(() => expect(close).toBeEnabled());
      await user.click(close);
      await waitFor(() =>
        expect(client.publishRosTopic).toHaveBeenCalledWith(
          expect.objectContaining({ topic: GRIPPER, payload_text: `{data: [${closed}]}` }),
        ),
      );
    });
  }
});
