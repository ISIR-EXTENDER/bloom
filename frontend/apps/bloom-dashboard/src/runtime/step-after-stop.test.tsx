/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle, RuntimeStopState } from "@bloom/api-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
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

describe("step preset after STOP and resume", () => {
  it("restarts from rest after a suspend", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: { "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "step" } },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    let stopped = false;
    const st = (): RuntimeStopState => ({ stopped, asserted: stopped, engaged_at: "", detail: "" });
    const sent: RuntimeTeleopCommandRequest[] = [];
    const client = {
      engageRuntimeStop: vi.fn(async () => {
        stopped = true;
        return st();
      }),
      getRuntimeStopState: vi.fn(async () => st()),
      resumeRuntimeStop: vi.fn(async () => {
        stopped = false;
        return st();
      }),
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request: RuntimeTeleopCommandRequest) => {
        if (stopped) throw new Error("Teleop command was rejected: runtime stop is engaged.");
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
    fireEvent.click(await screen.findByRole("button", { name: "Launch Explorer Manager runtime" }));
    const forward = (await screen.findAllByRole("button", { name: /Forward, one step/ }))[0];
    fireEvent.click(forward);
    await waitFor(() => expect(sent.some((r) => r.linear.y > 0)).toBe(true));
    const stepFromRest = sent.at(-1)?.linear.y ?? Number.NaN;

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy());
    await act(async () => {
      stopped = false;
      await client.resumeRuntimeStop();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop the robot" })).toBeTruthy(), { timeout: 3000 });
    expect(forward.closest(".bloom-joystick-widget")?.querySelector("output")?.textContent).toContain("y 0.00");
    const mark = sent.length;
    fireEvent.click(forward);
    await waitFor(() => expect(sent.length).toBeGreaterThan(mark));
    // One tap after resume must move exactly as far as one tap from rest.
    expect(sent[mark]?.linear.y).toBeCloseTo(stepFromRest);
  }, 20000);
});
