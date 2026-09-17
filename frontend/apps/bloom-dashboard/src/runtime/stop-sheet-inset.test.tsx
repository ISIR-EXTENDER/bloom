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

describe("the room the maintenance sheet leaves for STOP", () => {
  it("follows the screen's stop region rather than the corner fallback", async () => {
    const state = (): RuntimeStopState => ({ stopped: false, asserted: false, engaged_at: "", detail: "" });
    const client = {
      engageRuntimeStop: vi.fn(async () => state()),
      getRuntimeStopState: vi.fn(async () => state()),
      resumeRuntimeStop: vi.fn(async () => state()),
      publishRosTopic: vi.fn(),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    await screen.findByRole("button", { name: "Stop the robot" });

    const maintenance = await screen.findByRole("button", { name: /maintenance/i });
    fireEvent.pointerDown(maintenance);
    await new Promise((settle) => setTimeout(settle, 1700));
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Maintenance" }));

    const scrim = dialog.closest(".runtime-maintenance-scrim") as HTMLElement;
    const inset = Number.parseFloat(scrim.style.paddingRight);
    // The measured gap, not the 202 px corner fallback.
    expect(Number.isFinite(inset)).toBe(true);
    expect(inset).not.toBe(202);
  }, 20000);
});
