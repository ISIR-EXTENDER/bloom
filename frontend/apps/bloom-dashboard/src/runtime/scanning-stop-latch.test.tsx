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
HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

describe("a switch operator can undo their own STOP", () => {
  it("keeps scanning on while stopped, with resume as its only target", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "scan", scanPeriodMs: 600 },
        },
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

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Stop the robot" }));
    const resume = await screen.findByRole("button", { name: /Hold for one second to resume/ });

    // The switch bar is the operator's only input: it must still be there, and
    // the highlight must rest on resume or on the way out of the screen.
    await waitFor(() => expect(document.querySelector("[data-scan-switch]")).not.toBeNull());
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(resume));

    // One press arms; a switch cannot hold, and one press must not restart the robot.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    await screen.findByRole("button", { name: /Press again to resume/ });
    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();

    // A second press within 600 ms is the same press bouncing; this one is a second decision.
    await new Promise((resolve) => setTimeout(resolve, 650));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    await waitFor(() => expect(client.resumeRuntimeStop).toHaveBeenCalledOnce());
    expect(stopped).toBe(false);
  }, 20000);
});
