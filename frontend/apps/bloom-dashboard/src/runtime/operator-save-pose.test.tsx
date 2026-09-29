/**
 * @vitest-environment jsdom
 */
import type {
  PoseTargetResponse,
  RosTopicPublishRequest,
  RuntimeStopState,
  SavedPosition,
  SavedPositionRequest,
  SavedPositionScope,
} from "@bloom/api-client";
import { resetCommandStateForTests } from "@bloom/widget-renderers";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createCommandStateServer } from "../test-support/command-state-server";
import { explorerManagerClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient, RuntimeTopicSampleMessage } from "./runtime-action-dispatcher";

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  window.location.hash = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const sample = (topic: string, value: unknown): RuntimeTopicSampleMessage => ({
  type: "topic_sample",
  detail: `Received ${topic}.`,
  payload: { message_type: "", received_at: new Date().toISOString(), topic, value },
});

const HAND = {
  header: { frame_id: "base_link" },
  pose: { position: { x: 0.6, y: 0.27, z: 0.22 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
};
const JOINTS = {
  name: ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"],
  position: [1, 2, 3, 4, 5, 6],
};

function createClient() {
  const listeners = new Set<(sample: RuntimeTopicSampleMessage) => void>();
  const server = createCommandStateServer();
  const saved: SavedPosition[] = [];
  let stop: RuntimeStopState = { stopped: false, asserted: false, engaged_at: "", detail: "" };
  const client = {
    addRuntimeCommandStateListener: server.addRuntimeCommandStateListener,
    addRuntimeTopicSampleListener: vi.fn((listener: (sample: RuntimeTopicSampleMessage) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    engageRuntimeStop: vi.fn(async () => {
      stop = { stopped: true, asserted: true, engaged_at: "2026-09-29T12:00:00Z", detail: "" };
      return stop;
    }),
    getRuntimeStopState: vi.fn(async () => stop),
    resumeRuntimeStop: vi.fn(async () => {
      stop = { stopped: false, asserted: false, engaged_at: "", detail: "" };
      return stop;
    }),
    listSavedPositions: vi.fn(async () => structuredClone(saved)),
    // The server names the pose and saves its own /ee_pose; the list gives each a fingerprint.
    saveSavedPosition: vi.fn(async (request: SavedPositionRequest) => {
      const pose: SavedPosition = {
        ...structuredClone(request),
        name: `pose_${saved.length + 1}`,
        ee_pose: request.ee_pose ? { ...request.ee_pose, verified: true, fingerprint: "fp1" } : null,
      };
      saved.push(pose);
      return pose;
    }),
    cancelGoTo: vi.fn(async () => ({ detail: "passthrough" })),
    goToSavedPosition: vi.fn(
      async (name: string, _fingerprint: string, _scope?: SavedPositionScope): Promise<PoseTargetResponse> => ({
        name,
        topic: "/pose_target",
        status: "published",
        detail: "Published.",
      }),
    ),
    publishRosTopic: vi.fn(async (request: RosTopicPublishRequest) => ({
      detail: "Published.",
      message_type: request.message_type,
      status: "published" as const,
      topic: request.topic,
    })),
  } satisfies RuntimeActionClient;
  const stream = () =>
    act(() => {
      for (const listener of listeners) {
        listener(sample("/joint_states", JOINTS));
        listener(sample("/ee_pose", HAND));
      }
    });
  return { client, saved, server, stream };
}

/** The Operator role opens on Positions here, so the flow starts where an operator would reach it. */
async function openPositions(client: RuntimeActionClient) {
  render(
    <App
      configurationClient={explorerManagerClient((bundle) => {
        for (const profile of bundle.applications[0]?.profiles ?? []) {
          profile.preferred_control_layout_id = "manager_positions";
        }
      })}
      runtimeActionClient={client}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager", "Operator");
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 700)));

describe("saving a pose from the operator's Positions screen", () => {
  it("saves the hand and joints under the next free name, then goes back to it on an armed second press", async () => {
    const { client, saved, server, stream } = createClient();
    await openPositions(client);
    stream();

    const save = await screen.findByRole("button", { name: "Save the robot's current pose" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      name: "pose_1",
      joint_names: JOINTS.name,
      positions: JOINTS.position,
      ee_pose: { frame_id: "base_link", position: [0.6, 0.27, 0.22], orientation: [0, 0, 0, 1] },
    });
    expect(await screen.findByText("Saved as Pose 1.")).toBeTruthy();

    const list = screen.getByRole("list", { name: "Saved poses" });
    // The operator's list offers Go to and nothing that edits.
    expect(within(list).queryByRole("button", { name: /Delete|Rename/ })).toBeNull();
    fireEvent.click(within(list).getByRole("button", { name: "Go to Pose 1" }));
    expect(client.goToSavedPosition).not.toHaveBeenCalled();
    await settle();
    fireEvent.click(within(list).getByRole("button", { name: "Press again to send the arm to Pose 1" }));
    await waitFor(() =>
      expect(client.goToSavedPosition).toHaveBeenCalledWith("pose_1", "fp1", {
        appId: "explorer-manager",
        configId: "explorer-manager",
      }),
    );

    const record = { name: "pose_1", config_id: "explorer-manager", app_id: "explorer-manager", measured: true };
    act(() =>
      server.write(
        {
          "manager:behaviour": "behaviour/pose_target",
          "positions:go": { ...record, state: "moving", offset_mm: 150, offset_deg: 1 },
        },
        "robot",
        "measured",
      ),
    );
    expect(await screen.findByText(/Moving to Pose 1 · reported by the robot · measured tip 150 mm/)).toBeTruthy();
    // Every screen says the pad is not what drives until the pose target ends.
    expect(screen.getByRole("status", { name: "Going to a pose" })).toBeTruthy();
    // The library's own way out, besides STOP.
    fireEvent.click(screen.getByRole("button", { name: "Cancel the pose" }));
    await waitFor(() => expect(client.cancelGoTo).toHaveBeenCalled());

    act(() =>
      server.write(
        {
          "manager:behaviour": "behaviour/passthrough",
          "positions:go": { ...record, state: "arrived", offset_mm: 4, offset_deg: 0 },
        },
        "robot",
        "measured",
      ),
    );
    expect(await screen.findByText("Within tolerance of Pose 1 · measured tip 4 mm and 0° from it")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Going to a pose" })).toBeNull();
  }, 20000);

  it("lets STOP disarm an armed Go to, and sends nothing while stopped", async () => {
    const { client, stream } = createClient();
    await openPositions(client);
    stream();
    const save = await screen.findByRole("button", { name: "Save the robot's current pose" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    const go = await screen.findByRole("button", { name: "Go to Pose 1" });

    fireEvent.click(go);
    expect(await screen.findByRole("button", { name: "Press again to send the arm to Pose 1" })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalled());
    // The stopped canvas leaves the accessibility tree; the button is still there for a key or a switch to reach.
    await waitFor(() =>
      expect(screen.queryByRole("button", { hidden: true, name: "Press again to send the arm to Pose 1" })).toBeNull(),
    );

    await settle();
    fireEvent.click(screen.getByRole("button", { hidden: true, name: "Go to Pose 1" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { hidden: true, name: /Go to Pose 1|Press again/ }));
    await settle();
    expect(client.goToSavedPosition).not.toHaveBeenCalled();
    // The refusal is said in the library, where the press was, and Resume clears it.
    const notice = () => document.querySelector(".bloom-position-notice")?.textContent;
    await waitFor(() => expect(notice()).toBe("Robot stopped"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1600)));
    const resume = screen.getByRole("button", { name: "Hold for one second to resume" });
    fireEvent.pointerDown(resume);
    await act(() => new Promise((resolve) => setTimeout(resolve, 1300)));
    fireEvent.pointerUp(resume);
    await waitFor(() => expect(client.resumeRuntimeStop).toHaveBeenCalled());
    await waitFor(() => expect(notice()).not.toBe("Robot stopped"));
  }, 20000);
});
