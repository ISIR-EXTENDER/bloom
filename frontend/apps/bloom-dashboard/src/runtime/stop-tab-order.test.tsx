/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle, RuntimeStopState } from "@bloom/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
import { openRuntimeApp } from "../test-support/open-runtime-app";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

function configurationClient() {
  const bundle = structuredClone(explorerManagerConfiguration) as unknown as ConfigurationBundle;
  return {
    listConfigurations: vi.fn(async () => ["explorer-manager"]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
    upsertApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    deleteApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
  } as never;
}

describe("STOP in the tab order", () => {
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
});
