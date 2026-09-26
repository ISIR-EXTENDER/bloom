/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConfigurations } from "./use-configurations";

describe("loading the configurations", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // A tablet that booted before the robot PC showed "could not load" with no button, forever.
  it("tries again until the API answers", async () => {
    vi.useFakeTimers();
    const listConfigurations = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const client = {
      listConfigurations,
      getConfiguration: vi.fn(),
      getConfigurationShareStatus: vi.fn().mockResolvedValue({}),
    } as unknown as Parameters<typeof useConfigurations>[0];

    const { result } = renderHook(() => useConfigurations(client));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.status).toBe("error");

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.status).toBe("ready");
  });
});
