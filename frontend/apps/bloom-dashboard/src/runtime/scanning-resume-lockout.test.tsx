/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { explorerManagerClient as configurationClient } from "../test-support/configuration-client";
import { installFakeClock, uninstallFakeClock } from "../test-support/fake-clock";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;
HTMLElement.prototype.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;

import { elapse as wait } from "../test-support/fake-clock";

const dispatchers = {
  "the focused element": () => {
    const target = document.activeElement ?? document.body;
    act(() => {
      fireEvent.keyDown(target, { key: " " });
      fireEvent.keyUp(document.activeElement ?? document.body, { key: " " });
    });
  },
  window: () => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });
  },
};

function stopClient() {
  let stopped = false;
  let latch = 0;
  const state = (): RuntimeStopState => ({
    stopped,
    asserted: stopped,
    engaged_at: stopped ? `latch-${latch}` : "",
    detail: "",
  });
  return {
    engageRuntimeStop: vi.fn(async () => {
      stopped = true;
      latch += 1;
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

async function openScanningOnStop(client: RuntimeActionClient) {
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
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  const stop = await screen.findByRole("button", { name: "Stop the robot" });
  await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(stop));
}

const resumeButton = () => screen.getByRole("button", { name: /to resume/ });

// Checked and pressed in one go: a scan tick between a waitFor and the press lit the next target.
async function pressWhenResumeLit(press: () => void) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (document.querySelector("[data-scan-lit]") === resumeButton()) {
      press();
      return;
    }
    await wait(25);
  }
  throw new Error("Resume was never lit");
}

describe.each(Object.entries(dispatchers))("Resume after a scan STOP, switch keys on %s", (_, press) => {
  beforeEach(installFakeClock);
  afterEach(() => {
    cleanup();
    uninstallFakeClock();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("never resumes a panicking operator hammering the switch", async () => {
    const client = stopClient();
    await openScanningOnStop(client);

    for (let presses = 0; presses < 5; presses += 1) {
      press();
      await wait(250);
    }
    await wait(1000);

    expect(client.engageRuntimeStop).toHaveBeenCalled();
    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
  }, 20000);

  it("does not resume on a bouncing STOP press followed by another press", async () => {
    const client = stopClient();
    await openScanningOnStop(client);

    press();
    await wait(20);
    press();
    await wait(700);
    press();
    await wait(700);

    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
  }, 20000);

  it("resumes on a slow, deliberate two-step once the switch has rested", async () => {
    const client = stopClient();
    await openScanningOnStop(client);

    press();
    await waitFor(() => expect(client.engageRuntimeStop).toHaveBeenCalledOnce());
    await wait(1700);
    await pressWhenResumeLit(press);
    await screen.findByRole("button", { name: /Press again to resume/ });
    await wait(700);
    expect(client.resumeRuntimeStop).not.toHaveBeenCalled();
    await pressWhenResumeLit(press);

    await waitFor(() => expect(client.resumeRuntimeStop).toHaveBeenCalledOnce());
  }, 20000);
});
