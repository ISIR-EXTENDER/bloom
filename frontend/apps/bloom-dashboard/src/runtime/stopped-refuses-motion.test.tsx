/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle, RuntimeStopState } from "@bloom/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  return {
    listConfigurations: vi.fn(async () => ["explorer-manager"]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
    upsertApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    deleteApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
  } as never;
}

describe("a motion command while the stop latch is on", () => {
  it("is refused by the frontend, not only by the backend", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: { "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "step" } },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    let stopped = false;
    const state = (): RuntimeStopState => ({ stopped, asserted: stopped, engaged_at: "", detail: "" });
    const client = {
      engageRuntimeStop: vi.fn(async () => {
        stopped = true;
        return state();
      }),
      getRuntimeStopState: vi.fn(async () => state()),
      resumeRuntimeStop: vi.fn(async () => {
        stopped = false;
        return state();
      }),
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request: RuntimeTeleopCommandRequest) => ({
        detail: "ok",
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
        type: "teleop_ack" as const,
      })),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    const forward = (await screen.findAllByRole("button", { name: /Forward, one step/ }))[0];

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy());
    client.sendTeleopCommand.mockClear();

    // A programmatic click, the way a dwell or a switch press arrives, ignores
    // the canvas' pointer-events: none entirely.
    fireEvent.click(forward);
    await new Promise((settle) => setTimeout(settle, 50));

    expect(client.sendTeleopCommand).not.toHaveBeenCalled();
  }, 20000);
});
