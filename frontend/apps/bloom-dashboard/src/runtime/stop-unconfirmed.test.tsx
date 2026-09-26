/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

async function openApp(client: RuntimeActionClient) {
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
}

function press(element: HTMLElement) {
  fireEvent.pointerDown(element);
  fireEvent.pointerUp(element);
  fireEvent.click(element, { detail: 1 });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.location.hash = "";
});

describe("a STOP the backend never confirmed", () => {
  it("offers STOP again beside Resume, and a later STOP that lands clears the error", async () => {
    let stopped = false;
    let reachable = false;
    const state = (): RuntimeStopState => ({
      stopped,
      asserted: stopped,
      engaged_at: stopped ? "latch-1" : "",
      detail: "",
    });
    const client = {
      engageRuntimeStop: vi.fn(async () => {
        if (!reachable) {
          throw new Error("Network down");
        }
        stopped = true;
        return state();
      }),
      getRuntimeStopState: vi.fn(async () => state()),
      resumeRuntimeStop: vi.fn(async () => state()),
      publishRosTopic: vi.fn(),
    } satisfies RuntimeActionClient;
    await openApp(client);

    press(await screen.findByRole("button", { name: "Stop the robot" }));
    // The backend answers stopped: false, so the latch shows nothing to re-assert, yet the press still holds.
    const again = await screen.findByRole("button", { name: "Stop the robot again" });
    expect(screen.getByRole("button", { name: /Network down/ })).toBeTruthy();

    reachable = true;
    press(again);
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop the robot again" })).toBeNull());
    expect(screen.queryByText(/Network down/)).toBeNull();
  }, 20000);
});

describe("the supervisor's stop latch", () => {
  it("says a latch restored after a restart is not confirmed on the robot, and why", async () => {
    const detail = "Runtime stop restored after a backend restart.";
    const client = {
      getRuntimeStopState: vi.fn(async () => ({ stopped: true, asserted: false, engaged_at: "latch-1", detail })),
      publishRosTopic: vi.fn(),
    } satisfies RuntimeActionClient;
    window.history.replaceState(null, "", "#/runtime/supervisor/explorer-manager/explorer-manager");
    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    await screen.findByRole("region", { name: "Supervisor mirror" });

    const latch = (await screen.findByText("Stop latch")).parentElement as HTMLElement;
    await waitFor(() => expect(within(latch).getByText("Stopped, not confirmed on the robot")).toBeTruthy());
    expect(within(latch).getByText(detail)).toBeTruthy();
  }, 20000);
});
