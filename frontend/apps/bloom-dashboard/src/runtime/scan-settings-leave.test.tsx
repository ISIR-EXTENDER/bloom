/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const PERIOD_MS = 250;
const PREFERENCES_KEY = "bloom.runtime-user-preferences.v1";
const PROFILE_KEY = "explorer-manager:explorer-manager:operator";

function scanProfile() {
  window.localStorage.setItem(
    PREFERENCES_KEY,
    JSON.stringify({
      profileOverrides: { [PROFILE_KEY]: { motorAccessibilityPreset: "scan", scanPeriodMs: PERIOD_MS } },
      profilePreferences: { "explorer-manager:explorer-manager": "operator" },
      recentRuntimeSelections: [],
    }),
  );
}

const savedPreset = () =>
  JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "{}").profileOverrides?.[PROFILE_KEY]
    ?.motorAccessibilityPreset;

// The switch is the operator's only input: wait for the highlight, then press on whatever holds focus.
async function pressWhenLit(target: () => HTMLElement | null) {
  await waitFor(() => expect(document.querySelector("[data-scan-lit]")).toBe(target()), { timeout: 20000 });
  const focused = document.activeElement ?? document.body;
  act(() => {
    fireEvent.keyDown(focused, { key: " " });
  });
  act(() => {
    fireEvent.keyUp(document.activeElement ?? document.body, { key: " " });
  });
}

async function openSettingsBySwitch() {
  const client = { publishRosTopic: vi.fn() } satisfies RuntimeActionClient;
  render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
  fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
  await openRuntimeApp("Explorer Manager");
  await pressWhenLit(() => screen.queryByRole("button", { name: "Hold to open maintenance" }));
  const sheet = await screen.findByRole("dialog");
  await pressWhenLit(() => within(sheet).queryByRole("button", { name: /^Settings/ }));
  const settings = await screen.findByRole("region", { name: "Settings" });
  await pressWhenLit(() => within(settings).queryByRole("button", { name: "Touch" }));
  await waitFor(() =>
    expect(within(settings).getByRole("button", { name: "Touch" }).getAttribute("aria-pressed")).toBe("true"),
  );
  return settings;
}

describe("leaving Settings by switch after choosing another input method", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("keeps scanning until the change is saved, so the switch reaches Save", async () => {
    scanProfile();
    const settings = await openSettingsBySwitch();

    await pressWhenLit(() => within(settings).queryByRole("button", { name: "Save and resume" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Settings" })).toBeNull());
    expect(savedPreset()).not.toBe("scan");
  }, 90000);

  it("keeps scanning until the change is saved, so the switch reaches Discard", async () => {
    scanProfile();
    const settings = await openSettingsBySwitch();

    await pressWhenLit(() => within(settings).queryByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Settings" })).toBeNull());
    expect(savedPreset()).toBe("scan");
  }, 90000);
});
