/**
 * @vitest-environment jsdom
 */
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

const APP_KEY = "explorer-manager:explorer-manager";

async function switchPressOn(name: RegExp) {
  await waitFor(
    () => {
      const match = [...document.querySelectorAll<HTMLElement>("button")].find((button) =>
        name.test(button.getAttribute("aria-label") ?? button.textContent ?? ""),
      );
      if (!match?.hasAttribute("data-scan-lit")) {
        throw new Error("not lit yet");
      }
    },
    { timeout: 20000 },
  );
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
  });
}

async function openSheetByScan(role: string, overrides: Record<string, unknown>) {
  window.localStorage.setItem(
    "bloom.runtime-user-preferences.v1",
    JSON.stringify({
      profileOverrides: overrides,
      profilePreferences: { [APP_KEY]: role },
      recentRuntimeSelections: [],
    }),
  );
  const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  await switchPressOn(/maintenance/i);
  return screen.findByRole("dialog", { name: "Maintenance" });
}

// Every label the sheet's highlight rests on until Resume operating has been lit twice: one whole cycle.
async function litOverOneCycle(dialog: HTMLElement) {
  const lit = new Set<string>();
  let resumeLit = 0;
  let previous = "";
  const observer = new MutationObserver(() => {
    const element = dialog.querySelector("[data-scan-lit]");
    const label = element ? (element.getAttribute("aria-label") ?? element.textContent ?? "").trim() : "";
    if (label === "Resume operating" && previous !== label) {
      resumeLit += 1;
    }
    previous = label;
    lit.add(label);
  });
  observer.observe(dialog, { attributeFilter: ["data-scan-lit"], attributes: true, subtree: true });
  await waitFor(() => expect(resumeLit).toBeGreaterThanOrEqual(2), { timeout: 30000 });
  observer.disconnect();
  return lit;
}

describe("switching role under switch scanning", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("offers the switch only roles that scan, so STOP stays reachable after the choice", async () => {
    const dialog = await openSheetByScan("one-switch", {
      [`${APP_KEY}:one-switch`]: { scanPeriodMs: 600 },
      [`${APP_KEY}:operator`]: { motorAccessibilityPreset: "scan" },
    });
    await switchPressOn(/switch role/i);
    await screen.findByRole("group", { name: "Choose a role" });

    const lit = await litOverOneCycle(dialog);
    expect(lit.has("One switch")).toBe(true);
    expect(lit.has("Operator")).toBe(true);
    expect(lit.has("Bench")).toBe(false);
    expect(screen.getByRole("button", { name: "Bench" }).hasAttribute("data-scan-touch-only")).toBe(true);
    expect(screen.getByText(/Roles that do not scan are touch only too/)).toBeTruthy();
  }, 60000);

  it("leaves Switch role to touch when no other role scans", async () => {
    const dialog = await openSheetByScan("operator", {
      [`${APP_KEY}:operator`]: { motorAccessibilityPreset: "scan", scanPeriodMs: 600 },
      [`${APP_KEY}:one-switch`]: { motorAccessibilityPreset: "default" },
    });

    const lit = await litOverOneCycle(dialog);
    expect(lit.has("Settings")).toBe(true);
    expect(lit.has("Hold to switch role")).toBe(false);
    expect(screen.getByRole("button", { name: "Hold to switch role" }).hasAttribute("data-scan-touch-only")).toBe(true);
  }, 60000);
});
