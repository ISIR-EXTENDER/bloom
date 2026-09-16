/**
 * @vitest-environment jsdom
 */
import type { RuntimeControlState } from "@bloom/api-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeActionClient } from "./runtime-action-dispatcher";
import { useRuntimeControl } from "./use-runtime-control";

const available: RuntimeControlState = {
  active_sessions: 1,
  detail: "No runtime session owns robot control.",
  is_owner: false,
  owner_present: false,
  session_id: "session-1",
};

const owned: RuntimeControlState = {
  ...available,
  detail: "This runtime session owns robot control.",
  is_owner: true,
  owner_present: true,
};

describe("runtime control ownership", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps clients without the ownership protocol backward compatible", () => {
    const { result } = renderHook(() => useRuntimeControl({}, vi.fn()));

    expect(result.current.supported).toBe(false);
    expect(result.current.claiming).toBe(false);
  });

  it("claims each connected session and releases it after neutralizing on unmount", async () => {
    let listener: ((state: RuntimeControlState | null) => void) | undefined;
    const beforeRelease = vi.fn();
    const client = {
      addRuntimeControlStateListener: vi.fn((nextListener) => {
        listener = nextListener;
        nextListener(null);
        return vi.fn();
      }),
      claimRuntimeControl: vi.fn(async () => owned),
      disconnectRuntime: vi.fn(),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      publishRosTopic: vi.fn(),
      releaseRuntimeControl: vi.fn(async () => ({ ...available, session_id: "session-1" })),
    } satisfies RuntimeActionClient;
    const { result, unmount } = renderHook(() => useRuntimeControl(client, beforeRelease));

    act(() => listener?.(available));

    await waitFor(() => expect(result.current.state?.is_owner).toBe(true));
    expect(client.claimRuntimeControl).toHaveBeenCalledOnce();

    unmount();

    expect(beforeRelease).toHaveBeenCalledOnce();
    await waitFor(() => expect(client.releaseRuntimeControl).toHaveBeenCalledOnce());
    await waitFor(() => expect(client.disconnectRuntime).toHaveBeenCalledOnce());
  });

  it("still releases and disconnects when local neutralization throws", async () => {
    let listener: ((state: RuntimeControlState | null) => void) | undefined;
    const client = {
      addRuntimeControlStateListener: vi.fn((nextListener) => {
        listener = nextListener;
        return vi.fn();
      }),
      claimRuntimeControl: vi.fn(async () => owned),
      disconnectRuntime: vi.fn(),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      publishRosTopic: vi.fn(),
      releaseRuntimeControl: vi.fn(async () => available),
    } satisfies RuntimeActionClient;
    const { unmount } = renderHook(() =>
      useRuntimeControl(client, () => {
        throw new Error("local neutralizer failed");
      }),
    );
    act(() => listener?.(owned));

    unmount();

    await waitFor(() => expect(client.releaseRuntimeControl).toHaveBeenCalledOnce());
    expect(client.disconnectRuntime).toHaveBeenCalledOnce();
  });

  it("does not infer handover when another session owns control", async () => {
    const blocked = { ...available, detail: "Another runtime session owns robot control.", owner_present: true };
    let listener: ((state: RuntimeControlState | null) => void) | undefined;
    const client = {
      addRuntimeControlStateListener: vi.fn((nextListener) => {
        listener = nextListener;
        return vi.fn();
      }),
      claimRuntimeControl: vi.fn(async () => blocked),
      disconnectRuntime: vi.fn(),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      publishRosTopic: vi.fn(),
      releaseRuntimeControl: vi.fn(),
    } satisfies RuntimeActionClient;
    const { result } = renderHook(() => useRuntimeControl(client, vi.fn()));

    act(() => listener?.(blocked));

    await waitFor(() => expect(result.current.claiming).toBe(false));
    expect(result.current.state).toEqual(blocked);
    expect(client.claimRuntimeControl).toHaveBeenCalledOnce();
    expect(client.releaseRuntimeControl).not.toHaveBeenCalled();
  });

  it("refreshes availability without silently claiming it", async () => {
    vi.useFakeTimers();
    const blocked = { ...available, detail: "Another runtime session owns robot control.", owner_present: true };
    let listener: ((state: RuntimeControlState | null) => void) | undefined;
    const client = {
      addRuntimeControlStateListener: vi.fn((nextListener) => {
        listener = nextListener;
        return vi.fn();
      }),
      claimRuntimeControl: vi.fn(async () => blocked),
      disconnectRuntime: vi.fn(),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      getRuntimeControlState: vi.fn(async () => available),
      publishRosTopic: vi.fn(),
      releaseRuntimeControl: vi.fn(),
    } satisfies RuntimeActionClient;
    const { result } = renderHook(() => useRuntimeControl(client, vi.fn()));
    act(() => listener?.(blocked));
    await act(async () => Promise.resolve());
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.state).toEqual(available);
    expect(client.claimRuntimeControl).toHaveBeenCalledOnce();
  });

  it("does not let a slow refresh overwrite a newer claim state", async () => {
    vi.useFakeTimers();
    const blocked = { ...available, detail: "Another runtime session owns robot control.", owner_present: true };
    let listener: ((state: RuntimeControlState | null) => void) | undefined;
    let resolveRefresh: (state: RuntimeControlState) => void = () => {};
    const client = {
      addRuntimeControlStateListener: vi.fn((nextListener) => {
        listener = nextListener;
        return vi.fn();
      }),
      claimRuntimeControl: vi.fn(async () => blocked),
      disconnectRuntime: vi.fn(),
      ensureRuntimeConnected: vi.fn(async () => undefined),
      getRuntimeControlState: vi.fn(
        () =>
          new Promise<RuntimeControlState>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
      publishRosTopic: vi.fn(),
      releaseRuntimeControl: vi.fn(async () => available),
    } satisfies RuntimeActionClient;
    const { result } = renderHook(() => useRuntimeControl(client, vi.fn()));
    act(() => listener?.(blocked));
    await act(async () => Promise.resolve());
    act(() => vi.advanceTimersByTime(2000));
    act(() => listener?.(owned));
    await act(async () => resolveRefresh(available));

    expect(result.current.state).toEqual(owned);
  });
});
