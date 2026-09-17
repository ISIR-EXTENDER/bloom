/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;
Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body });

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

describe("switch scanning behind the maintenance overlay", () => {
  it("does not fire a canvas control while the maintenance dialog covers it", async () => {
    window.localStorage.setItem(
      "bloom.runtime-user-preferences.v1",
      JSON.stringify({
        profileOverrides: {
          "explorer-manager:explorer-manager:operator": { motorAccessibilityPreset: "scan", scanPeriodMs: 3000 },
        },
        profilePreferences: { "explorer-manager:explorer-manager": "operator" },
        recentRuntimeSelections: [],
      }),
    );
    const client = {
      publishRosTopic: vi.fn(async (request) => ({
        detail: "Published.",
        message_type: request.message_type,
        status: "published" as const,
        topic: request.topic,
      })),
      sendTeleopCommand: vi.fn(async (request) => ({
        detail: "ok",
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
        type: "teleop_ack" as const,
      })),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Launch Explorer Manager runtime" }));
    await waitFor(() => expect(document.querySelector("[data-scan-lit]")).not.toBeNull());

    const menu = screen.getByRole("button", { name: /maintenance/i });
    fireEvent.pointerDown(menu);
    await new Promise((r) => setTimeout(r, 1700));
    const dialog = await screen.findByRole("dialog");
    expect(document.querySelector("[data-scan-lit]")).toBeNull();

    const before = client.sendTeleopCommand.mock.calls.length + client.publishRosTopic.mock.calls.length;
    // A caregiver taps the dialog's background, and presses Space in it.
    act(() => {
      dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
    });
    await new Promise((r) => setTimeout(r, 200));
    const after = client.sendTeleopCommand.mock.calls.length + client.publishRosTopic.mock.calls.length;
    expect(after).toBe(before);
  }, 20000);
});
