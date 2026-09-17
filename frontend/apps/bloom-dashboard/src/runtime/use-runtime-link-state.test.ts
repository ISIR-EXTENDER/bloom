/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeLinkState } from "./runtime-action-dispatcher";
import { useRuntimeLinkState } from "./use-runtime-link-state";

function createLinkClient() {
  const listeners = new Set<(state: RuntimeLinkState) => void>();
  return {
    client: {
      addRuntimeLinkStateListener: (listener: (state: RuntimeLinkState) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      ensureRuntimeConnected: vi.fn(async () => undefined),
    },
    emit: (state: RuntimeLinkState) => {
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}

describe("runtime link state", () => {
  it("counts each completed connection, so a screen knows to subscribe again", () => {
    // A reconnected socket is a new session holding no subscriptions.
    const { client, emit } = createLinkClient();
    const { result } = renderHook(() => useRuntimeLinkState(client));

    act(() => emit("connecting"));
    act(() => emit("connected"));
    expect(result.current).toMatchObject({ connectionCount: 1, settled: true, state: "connected" });

    act(() => emit("disconnected"));
    act(() => emit("connected"));
    expect(result.current).toMatchObject({ connectionCount: 2, state: "connected" });
  });

  it("does not count a repeated connected report as a new connection", () => {
    const { client, emit } = createLinkClient();
    const { result } = renderHook(() => useRuntimeLinkState(client));

    act(() => emit("connected"));
    act(() => emit("connected"));

    expect(result.current.connectionCount).toBe(1);
  });
});
