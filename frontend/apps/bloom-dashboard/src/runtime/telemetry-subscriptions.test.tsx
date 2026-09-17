/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import bloomDebugConfiguration from "../../../../../backend/seed/applications/bloom-debug.json";
import { App } from "../App";
import type { RuntimeActionClient, RuntimeLinkState } from "./runtime-action-dispatcher";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as never;

function configurationClient() {
  const bundle = bloomDebugConfiguration as unknown as ConfigurationBundle;
  return {
    listConfigurations: vi.fn(async () => ["bloom-debug"]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
  } as never;
}

describe("telemetry subscriptions", () => {
  it("asks once per open socket and survives a refused subscription", async () => {
    const linkListeners = new Set<(state: RuntimeLinkState) => void>();
    const setLink = (state: RuntimeLinkState) =>
      act(() => {
        for (const listener of linkListeners) {
          listener(state);
        }
      });
    const client = {
      addRuntimeLinkStateListener: vi.fn((listener: (state: RuntimeLinkState) => void) => {
        linkListeners.add(listener);
        listener("connecting");
        return () => linkListeners.delete(listener);
      }),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      publishRosTopic: vi.fn(),
      subscribeRuntimeTopic: vi.fn(async () => {
        throw new Error("Topic subscription could not be started.");
      }),
    } satisfies RuntimeActionClient;

    render(<App configurationClient={configurationClient()} runtimeActionClient={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Launch Bloom Debug runtime" }));
    await screen.findByRole("region", { name: "Runtime application" });

    expect(client.subscribeRuntimeTopic).not.toHaveBeenCalled();
    setLink("connected");
    await waitFor(() => expect(client.subscribeRuntimeTopic).toHaveBeenCalledTimes(3));

    setLink("disconnected");
    setLink("connecting");
    setLink("connected");
    await waitFor(() => expect(client.subscribeRuntimeTopic).toHaveBeenCalledTimes(6));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.subscribeRuntimeTopic).toHaveBeenCalledTimes(6);
  });
});
