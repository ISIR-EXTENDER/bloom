/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
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
Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body });

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

describe("the maintenance sheet under pointer dwell", () => {
  it("lets a dwell operator back out of the sheet they opened", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "explorer-manager:explorer-manager:operator": { dwellEnabled: true, dwellMs: 400 },
        },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");

    const maintenance = await screen.findByRole("button", { name: /maintenance/i });
    fireEvent.pointerMove(maintenance, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Maintenance" })).toBeTruthy(), { timeout: 5000 });

    // Nothing in the sheet is dwellable unless the sheet runs its own dwell:
    // the workspace's is off while maintenance is open.
    const close = screen.getByRole("button", { name: "Close" });
    fireEvent.pointerMove(close, { clientX: 400, clientY: 40 });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Maintenance" })).toBeNull(), { timeout: 5000 });
  }, 20000);
});
