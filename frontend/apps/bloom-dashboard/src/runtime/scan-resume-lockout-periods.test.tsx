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

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const press = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
  });

function stopClient() {
  let stopped = false;
  const state = (): RuntimeStopState => ({
    stopped,
    asserted: stopped,
    engaged_at: stopped ? "latch-1" : "",
    detail: "",
  });
  return {
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
}

const resumeButton = () => document.querySelector<HTMLElement>('button[data-stopped="true"]');
const resumeLit = () => resumeButton()?.hasAttribute("data-scan-lit") === true;

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (condition()) {
      return;
    }
    await wait(20);
  }
  throw new Error("timed out");
}

describe.each([600, 700, 1000, 1400])("Resume after a scan STOP at a %i ms period", (periodMs) => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("says to let go while presses are refused, and resumes a user who pauses when told", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "scan", scanPeriodMs: periodMs },
        },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    const client = stopClient();
    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    const stop = await screen.findByRole("button", { name: "Stop the robot" });
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(stop), { timeout: 10000 });
    press();
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledOnce());

    // Presses whenever Resume lights, except while it says to let go.
    let sawLocked = false;
    let first = true;
    for (let lighting = 0; lighting < 8 && client.resumeRuntimeStop.mock.calls.length === 0; lighting += 1) {
      if (!first) {
        await until(() => !resumeLit());
      }
      first = false;
      await until(resumeLit);
      const name = resumeButton()?.getAttribute("aria-label") ?? "";
      if (name.startsWith("Let go of the switch")) {
        expect(resumeButton()?.textContent).toContain("LET GO OF THE SWITCH");
        sawLocked = true;
        continue;
      }
      press();
      if (resumeButton()?.getAttribute("aria-label")?.startsWith("Press again")) {
        await wait(Math.max(600, periodMs) + 100);
        expect(resumeLit()).toBe(true);
        press();
      }
    }

    await waitFor(() => expect(client.resumeRuntimeStop).toHaveBeenCalledOnce());
    if (periodMs < 750) {
      expect(sawLocked).toBe(true);
    }
  }, 40000);
});
