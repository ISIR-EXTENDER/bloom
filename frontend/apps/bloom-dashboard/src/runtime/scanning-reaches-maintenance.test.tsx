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
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

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

  it("leaves pages with no scanner out of the sheet's scan, and says a caregiver can open them by touch", async () => {
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
    await switchPressOn(/maintenance/i);
    const dialog = await screen.findByRole("dialog", { name: "Maintenance" });

    const lit = new Set<string>();
    const observer = new MutationObserver(() => {
      for (const element of dialog.querySelectorAll("[data-scan-lit]")) {
        lit.add((element.getAttribute("aria-label") ?? element.textContent ?? "").trim());
      }
    });
    observer.observe(dialog, { attributeFilter: ["data-scan-lit"], attributes: true, subtree: true });
    await waitFor(() => expect(lit.has("Resume operating")).toBe(true), { timeout: 30000 });
    observer.disconnect();

    expect(lit.has("Settings")).toBe(true);
    for (const label of ["Exit to library", "Edit this screen in the builder", "Edit app", "Help", "Home"]) {
      expect(lit.has(label)).toBe(false);
    }
    expect(screen.getByText(/a caregiver can open them by touch/)).toBeTruthy();
  }, 60000);
});
