/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("STOP in the tab order", () => {
  afterEach(() => {
    cleanup();
    window.location.hash = "";
    window.localStorage.clear();
  });

  it("is the first tab stop of the screen, and the only one taken out of document order", async () => {
    const stopped: RuntimeStopState = { asserted: true, detail: "", engaged_at: "", stopped: true };
    const client = {
      engageRuntimeStop: vi.fn(async () => stopped),
      publishRosTopic: vi.fn(),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    const stop = await screen.findByRole("button", { name: "Stop the robot" });

    expect(stop.tabIndex).toBe(1);
    const ahead = [...document.querySelectorAll<HTMLElement>("[tabindex]")].filter(
      (element) => element.tabIndex > 0 && element !== stop,
    );
    expect(ahead).toEqual([]);
  }, 20000);

  // The sheet keeps Tab inside itself, and STOP is drawn outside it: a keyboard operator could not reach it.
  it("stays reachable by Tab while the maintenance sheet is open", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profilePreferences: { "explorer-manager:explorer-manager": "bench" },
        recentRuntimeSelections: [],
      }),
    );
    const client = {
      engageRuntimeStop: vi.fn(
        async (): Promise<RuntimeStopState> => ({
          asserted: true,
          detail: "",
          engaged_at: "",
          stopped: true,
        }),
      ),
      publishRosTopic: vi.fn(),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    fireEvent.click(await screen.findByRole("button", { name: "Open maintenance" }));
    const dialog = await screen.findByRole("dialog", { name: "Maintenance" });
    const stop = document.querySelector('button[data-scan-priority="stop"]');
    const visited = new Set<Element | null>();
    dialog.focus();
    for (let press = 0; press < 40 && !visited.has(stop); press += 1) {
      fireEvent.keyDown(document, { key: "Tab" });
      visited.add(document.activeElement);
    }

    expect(visited.has(stop)).toBe(true);
  }, 20000);
});
