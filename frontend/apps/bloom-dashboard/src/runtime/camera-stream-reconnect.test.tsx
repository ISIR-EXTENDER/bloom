/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraStreams } from "./camera-stream";

class FakeSocket {
  static opened: FakeSocket[] = [];
  binaryType = "";
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  closed = false;
  close() {
    this.closed = true;
  }
}

describe("a camera stream that drops", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.opened = [];
    vi.stubGlobal("WebSocket", FakeSocket);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const targets = [{ widgetId: "gripper", topic: "/camera/color/image_raw/compressed" }];

  // An API restart left the placeholder until the operator changed screen.
  it("reconnects, and says it is doing so", () => {
    const { result } = renderHook(() => useCameraStreams(targets, "http://127.0.0.1:8000"));
    act(() => FakeSocket.opened[0]?.onclose?.({ code: 1006, reason: "" }));

    expect(result.current.gripper).toMatchObject({ reconnecting: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it("keeps only the live socket across a long outage", () => {
    const { unmount } = renderHook(() => useCameraStreams(targets, "http://127.0.0.1:8000"));
    for (let drop = 0; drop < 5; drop += 1) {
      act(() => FakeSocket.opened.at(-1)?.onclose?.({ code: 1006, reason: "" }));
      act(() => vi.advanceTimersByTime(10000));
    }
    expect(FakeSocket.opened).toHaveLength(6);

    unmount();

    expect(FakeSocket.opened.filter((socket) => socket.closed)).toEqual([FakeSocket.opened[5]]);
  });

  it("does not retry a topic the API refused", () => {
    renderHook(() => useCameraStreams(targets, "http://127.0.0.1:8000"));
    act(() => FakeSocket.opened[0]?.onclose?.({ code: 1008, reason: "not a valid name" }));
    act(() => vi.advanceTimersByTime(20000));

    expect(FakeSocket.opened).toHaveLength(1);
  });
});
