/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

function createJoystickLabConfigurationClient() {
  const bundle = structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle;
  const application = bundle.applications[0];
  if (!application) {
    throw new Error("Explorer Manager seed has no application.");
  }

  application.screens.sort((screen) => (screen.id === "manager_joystick_lab" ? -1 : 1));

  return {
    listConfigurations: vi.fn(async () => ["explorer-manager"]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
    upsertApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    deleteApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
  } as never;
}

function createRuntimeActionClient() {
  return {
    listRuntimeCapabilities: vi.fn(async () => ({
      capabilities: [
        { id: "command-dispatcher", available: true, detail: "Commands are published to ROS." },
        { id: "data-source", available: true, detail: "Topic subscriptions deliver live samples." },
        { id: "teleop-adapter", available: true, detail: "Teleop commands reach the manager." },
      ],
      command_frame_id: "base_link",
      command_frame_ids: ["base_link", "effector_frame", "hybrid_frame", "ft_frame"],
      robot_name: "Explorer",
    })),
    publishRosTopic: vi.fn(async (request) => ({
      detail: "Published.",
      message_type: request.message_type,
      status: "published" as const,
      topic: request.topic,
    })),
    sendTeleopCommand: vi.fn(async (request) => ({
      detail: "Teleop command accepted.",
      payload: {
        angular: request.angular,
        frame_id: request.frame_id ?? "",
        linear: request.linear,
        mode: request.mode,
        seq: request.seq,
        status: "accepted" as const,
        target: request.target,
      },
      type: "teleop_ack" as const,
    })),
  } satisfies RuntimeActionClient;
}

describe("the Explorer Manager joystick lab", () => {
  it("changes the shared command frame only after motion returns to zero", async () => {
    const runtimeActionClient = createRuntimeActionClient();
    render(
      <App configurationClient={createJoystickLabConfigurationClient()} runtimeActionClient={runtimeActionClient} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Launch Explorer Manager runtime" }));

    const translation = await screen.findByRole("application", { name: "Translation" });
    const toolFrame = () => screen.getByRole("button", { name: /^Tool/ });
    expect(screen.getByTitle("Reference frame for operator commands")).toHaveTextContent("base_link");

    // Three keyboard steps cross the Joystick lab's 0.2 axis dead zone.
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    await waitFor(() =>
      expect(runtimeActionClient.sendTeleopCommand.mock.calls.some(([request]) => request.linear.x > 0)).toBe(true),
    );
    await waitFor(() => expect(toolFrame()).toBeDisabled());
    expect(toolFrame()).toHaveAccessibleDescription("Release controls.");

    fireEvent.keyUp(translation, { key: "ArrowRight" });
    await waitFor(() => expect(toolFrame()).toBeEnabled());
    fireEvent.click(toolFrame());
    await waitFor(() =>
      expect(screen.getByTitle("Reference frame for operator commands")).toHaveTextContent("effector_frame"),
    );
    expect(runtimeActionClient.sendTeleopCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        frame_id: "effector_frame",
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      }),
    );

    fireEvent.keyDown(translation, { key: "ArrowRight" });
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    await waitFor(() =>
      expect(runtimeActionClient.sendTeleopCommand).toHaveBeenLastCalledWith(
        expect.objectContaining({ frame_id: "effector_frame" }),
      ),
    );
    fireEvent.keyUp(translation, { key: "ArrowRight" });
  });
});
