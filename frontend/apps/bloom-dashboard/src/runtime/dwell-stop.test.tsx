/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("dwell and STOP", () => {
  it("does not resume a STOP the operator just pressed while the pointer rests on it", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: { "explorer-manager:explorer-manager:operator": { dwellEnabled: true, dwellMs: 1000 } },
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
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    const stop = await screen.findByRole("button", { name: "Stop the robot" });

    // The pointer arrives on STOP, presses it, and keeps resting there.
    act(() => {
      stop.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 150));
    fireEvent.pointerDown(stop);
    await waitFor(() => expect(screen.getByRole("button", { name: /Hold for one second to resume/ })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
    expect(stopped).toBe(true);
  }, 20000);
});
