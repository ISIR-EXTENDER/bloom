import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;
HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

describe("the maintenance sheet under pointer dwell", () => {
  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

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

  // The role switch took only a hold, and a dwell arrives as a click: a dwell operator could not change role.
  it("lets a dwell operator switch role", async () => {
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

    const switchRole = screen.getByRole("button", { name: "Hold to switch role" });
    fireEvent.pointerMove(switchRole, { clientX: 200, clientY: 300 });

    await waitFor(() => expect(screen.getByText("Choose a role")).toBeTruthy(), { timeout: 5000 });
  }, 20000);
});
