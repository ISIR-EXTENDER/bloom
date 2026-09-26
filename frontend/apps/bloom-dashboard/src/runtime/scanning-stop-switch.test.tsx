/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// On the focused element, as a switch box's key arrives: dispatching on window missed the bug.
function pressSwitch(holdMs = 0) {
  const target = document.activeElement ?? document.body;
  act(() => {
    fireEvent.keyDown(target, { key: " " });
  });
  return (async () => {
    if (holdMs > 0) {
      await act(() => wait(holdMs));
    }
    act(() => {
      fireEvent.keyUp(document.activeElement ?? document.body, { key: " " });
    });
  })();
}

function scanProfile(scanPeriodMs: number) {
  window.localStorage.setItem(
    "bloom.runtime-user-preferences.v1",
    JSON.stringify({
      profileOverrides: {
        "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "scan", scanPeriodMs },
      },
      profilePreferences: { "explorer-manager:explorer-manager": "operator" },
      recentRuntimeSelections: [],
    }),
  );
}

function stopClient(options: { assertFails?: boolean } = {}) {
  let stopped = false;
  let latch = 0;
  const state = (): RuntimeStopState => ({
    stopped,
    asserted: stopped && !options.assertFails,
    engaged_at: stopped ? `latch-${latch}` : "",
    detail: stopped && options.assertFails ? "Runtime stop latched, but ROS assertion failed." : "",
  });
  return {
    engageRuntimeStop: vi.fn(async () => {
      stopped = true;
      latch += 1;
      if (options.assertFails) {
        throw new Error("Bloom API request failed with status 503");
      }
      return state();
    }),
    getRuntimeStopState: vi.fn(async () => state()),
    resumeRuntimeStop: vi.fn(async () => {
      stopped = false;
      return state();
    }),
    publishRosTopic: vi.fn(),
  } satisfies RuntimeActionClient;
}

async function openScanning(client: RuntimeActionClient) {
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
}

describe("STOP under switch scanning", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("lights the mounted STOP first when an app opens in scan mode, and the first press stops", async () => {
    scanProfile(5000);
    const client = stopClient();
    await openScanning(client);

    const stop = await screen.findByRole("button", { name: "Stop the robot" });
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(stop));
    expect(stop.isConnected).toBe(true);

    await pressSwitch();
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledOnce());
  });

  it("after a scan-driven STOP, a key switch arms and confirms Resume and a long press does not resume", async () => {
    scanProfile(2500);
    const client = stopClient();
    await openScanning(client);
    const stop = await screen.findByRole("button", { name: "Stop the robot" });
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(stop));

    await pressSwitch();
    const resume = await screen.findByRole("button", { name: /Hold for one second to resume/ });
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(resume));

    // A switch cannot hold: a long press is one press, and it only arms.
    await pressSwitch(1200);
    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: /Press again to resume/ });

    await pressSwitch();
    await waitFor(() => expect(client.resumeRuntimeStop).toHaveBeenCalledOnce());
  }, 20000);

  it("offers STOP again, first in the scan, while the latch is not asserted", async () => {
    scanProfile(5000);
    const client = stopClient({ assertFails: true });
    await openScanning(client);

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Stop the robot" }));
    const again = await screen.findByRole("button", { name: "Stop the robot again" });
    expect(screen.getByRole("button", { name: /Hold for one second to resume/ })).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(again));

    await pressSwitch();
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledTimes(2));
    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
  }, 20000);
});
