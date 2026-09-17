/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import sandboxConfiguration from "../../../../../backend/seed/applications/sandbox.json";
import { App } from "../App";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

const bundles: Record<string, ConfigurationBundle> = {
  "explorer-manager": explorerManagerConfiguration as unknown as ConfigurationBundle,
  sandbox: sandboxConfiguration as unknown as ConfigurationBundle,
};

// Sandbox is listed first: a reload that forgets the selection lands there.
function configurationClient() {
  return {
    listConfigurations: vi.fn(async () => ["sandbox", "explorer-manager"]),
    getConfiguration: vi.fn(async (id: string) => structuredClone(bundles[id] as ConfigurationBundle)),
    upsertConfiguration: vi.fn(),
    upsertApplication: vi.fn(),
    deleteApplication: vi.fn(),
  } as never;
}

const runtimeActionClient: RuntimeActionClient = { publishRosTopic: vi.fn() };

async function expectKioskOn(appName: string, screenTitle: string) {
  expect(await screen.findByRole("heading", { level: 2, name: appName })).toBeTruthy();
  expect(document.querySelector(".runtime-kiosk-screen")?.textContent).toBe(screenTitle);
}

describe("reloading a runtime app", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("reopens the same app, role and screen instead of the first app", async () => {
    render(<App configurationClient={configurationClient()} runtimeActionClient={runtimeActionClient} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    await openRuntimeApp("Explorer Manager", "Operator");
    await expectKioskOn("Explorer Manager", "Drive · Operator");
    expect(window.location.hash).toBe("#/runtime/app");

    cleanup();
    render(<App configurationClient={configurationClient()} runtimeActionClient={runtimeActionClient} />);

    await expectKioskOn("Explorer Manager", "Drive · Operator");
    expect(screen.getByText("Operator").getAttribute("data-role")).toBe("operator");
  });

  it("falls back to the role's layout when the remembered screen is gone", async () => {
    window.history.replaceState(null, "", "/#/runtime/app");
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({ profilePreferences: { "explorer-manager:explorer-manager": "operator" } }),
    );
    window.sessionStorage.setItem(
      "bloom.runtime-session-selection.v1",
      JSON.stringify({ appId: "explorer-manager", configId: "explorer-manager", screenId: "removed" }),
    );

    render(<App configurationClient={configurationClient()} runtimeActionClient={runtimeActionClient} />);

    await expectKioskOn("Explorer Manager", "Drive · Operator");
  });
});
