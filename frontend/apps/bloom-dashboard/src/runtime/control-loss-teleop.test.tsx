/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle, RuntimeControlState } from "@bloom/api-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient, RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

function configurationClient() {
  const bundle = structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle;
  bundle.applications[0]?.screens.sort((s) => (s.id === "manager_joystick_lab" ? -1 : 1));
  return {
    listConfigurations: vi.fn(async () => ["explorer-manager"]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
    upsertApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    deleteApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
  } as never;
}

describe("losing control while a joystick is held", () => {
  it("does not stream the released joystick after control is reclaimed", async () => {
    let controlListener: ((state: RuntimeControlState | null) => void) | undefined;
    let owner = true;
    let session = "s1";
    const ownedState = (): RuntimeControlState => ({
      active_sessions: 1,
      detail: "owned",
      is_owner: true,
      owner_present: true,
      session_id: session,
    });
    const sent: RuntimeTeleopCommandRequest[] = [];
    const client = {
      addRuntimeControlStateListener: vi.fn((listener) => {
        controlListener = listener;
        listener(null);
        return () => undefined;
      }),
      claimRuntimeControl: vi.fn(async () => {
        owner = true;
        return ownedState();
      }),
      releaseRuntimeControl: vi.fn(async () => ({ ...ownedState(), is_owner: false })),
      disconnectRuntime: vi.fn(),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      listRuntimeCapabilities: vi.fn(async () => ({
        capabilities: [
          { id: "command-dispatcher", available: true, detail: "" },
          { id: "data-source", available: true, detail: "" },
          { id: "teleop-adapter", available: true, detail: "" },
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
      sendTeleopCommand: vi.fn(async (request: RuntimeTeleopCommandRequest) => {
        if (!owner) {
          throw new Error("Teleop command rejected: this session does not own control.");
        }
        sent.push(request);
        return {
          detail: "ok",
          payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
          type: "teleop_ack" as const,
        };
      }),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    // Joystick Lab first: it has the translation pad and the Height slider together.
    const translation = await screen.findByRole("application", { name: "Translation" });
    act(() => controlListener?.({ ...ownedState(), is_owner: false, owner_present: false }));
    await waitFor(() => expect(client.claimRuntimeControl).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector("[data-runtime-control='owned']")).not.toBeNull());

    // Operator pushes the translation joystick right.
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    fireEvent.keyDown(translation, { key: "ArrowRight" });
    await waitFor(() => expect(sent.some((r) => r.linear.x > 0)).toBe(true));

    // The socket drops: the client reports no control state.
    owner = false;
    act(() => controlListener?.(null));
    await waitFor(() => expect(document.querySelector("[data-runtime-control='blocked']")).not.toBeNull());

    // Operator lets go during the outage.
    fireEvent.keyUp(translation, { key: "ArrowRight" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reconnect: new session, auto-claim.
    session = "s2";
    act(() => controlListener?.({ ...ownedState(), is_owner: false, owner_present: false }));
    await waitFor(() => expect(document.querySelector("[data-runtime-control='owned']")).not.toBeNull());
    const sentBefore = sent.length;

    // Operator touches only the Height slider, then puts it back to rest.
    const height = screen.getAllByRole("slider").find((el) => el.getAttribute("aria-label")?.includes("Height"));
    if (!height) throw new Error("Missing Height slider.");
    height.focus();
    fireEvent.keyDown(height, { key: "ArrowUp" });
    await waitFor(() => expect(sent.length).toBeGreaterThan(sentBefore));
    fireEvent.keyDown(height, { key: "ArrowDown" });
    fireEvent.blur(height);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const afterReclaim = sent.slice(sentBefore);
    expect(afterReclaim.length).toBeGreaterThan(0);
    // Nothing after the reclaim may carry the joystick released during the outage.
    expect(afterReclaim.every((request) => request.linear.x === 0)).toBe(true);
    // And once the slider is back at rest the stream settles on a true zero.
    const last = sent.at(-1);
    expect(last?.linear).toEqual({ x: 0, y: 0, z: 0 });
  }, 20000);
});
