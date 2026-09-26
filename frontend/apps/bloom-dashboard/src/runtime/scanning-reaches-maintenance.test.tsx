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

/** Lights `name` without waiting out the cycle, then presses the switch. */
async function switchPressOn(name: RegExp) {
  const target = await waitFor(
    () => {
      const match = [...document.querySelectorAll<HTMLElement>("button")].find((button) =>
        name.test(button.getAttribute("aria-label") ?? button.textContent ?? ""),
      );
      if (!match?.hasAttribute("data-scan-lit")) {
        throw new Error("not lit yet");
      }
      return match;
    },
    { timeout: 20000 },
  );
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
  });
  return target;
}

describe("maintenance under switch scanning", () => {
  it("scans the maintenance button and opens the sheet, then reaches Settings from it", async () => {
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
    const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager");
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).not.toBeNull());

    // A switch press cannot satisfy the 1.5 s pointer hold, so the scan set
    // includes the button and its activation opens maintenance directly.
    await switchPressOn(/maintenance/i);
    const dialog = await screen.findByRole("dialog", { name: "Maintenance" });

    await switchPressOn(/^Settings$/);
    await screen.findByRole("region", { name: "Settings" });
    expect(dialog.isConnected).toBe(false);
  }, 40000);
});
