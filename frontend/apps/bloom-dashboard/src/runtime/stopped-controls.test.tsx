/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle, RuntimeStopState } from "@bloom/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

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

describe("the canvas while the STOP latch is on", () => {
  it("marks its controls disabled and takes them out of the tab order, then gives them back", async () => {
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
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    const gripper = await screen.findByRole("button", { name: "Gripper: Close gripper" });
    expect(gripper.getAttribute("aria-disabled")).toBeNull();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));
    const resume = await screen.findByRole("button", { name: /Hold for one second to resume/ });

    await waitFor(() => expect(gripper.getAttribute("aria-disabled")).toBe("true"));
    expect(gripper.tabIndex).toBe(-1);
    // The way out is never disabled.
    expect(resume.getAttribute("aria-disabled")).toBeNull();
    expect(resume.tabIndex).toBe(1);

    fireEvent.keyDown(resume, { key: "Enter" });
    await new Promise((settle) => setTimeout(settle, 1200));
    fireEvent.keyUp(resume, { key: "Enter" });

    await waitFor(() => expect(gripper.getAttribute("aria-disabled")).toBeNull());
    expect(gripper.tabIndex).toBe(0);
  }, 20000);
});
