import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraStreams } from "./camera-stream";

class FakeSocket {
  static opened: FakeSocket[] = [];
  binaryType = "";
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closedWith: [number, string] | null = null;
  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeSocket.opened.push(this);
  }
  close(code: number, reason: string) {
    this.closedWith = [code, reason];
  }
  /** The backend's first message, then the frames as blobs. */
  opened(connected = true) {
    this.onmessage?.({ data: JSON.stringify({ type: "camera_stream_opened", connected }) });
  }
  frame(bytes = "jpeg") {
    this.onmessage?.({ data: new Blob([bytes]) });
  }
}

/** Object URLs the tab holds right now: a leak here is a leak in the tablet's memory. */
const held = new Map<string, Blob>();
let serial = 0;

const targets = [{ widgetId: "gripper", topic: "/camera/color/image_raw/compressed" }];

describe("camera frames over their own socket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.opened = [];
    held.clear();
    serial = 0;
    vi.stubGlobal("WebSocket", FakeSocket);
    URL.createObjectURL = (blob: Blob) => {
      serial += 1;
      const url = `blob:frame-${serial}`;
      held.set(url, blob);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      held.delete(url);
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens one socket per widget with the topic in its address and the key as a subprotocol", () => {
    renderHook(() =>
      useCameraStreams([...targets, { widgetId: "wrist", topic: "/wrist/image/compressed" }], "http://api:8000", "k1"),
    );
    expect(FakeSocket.opened.map((socket) => socket.url)).toEqual([
      "ws://api:8000/api/v1/runtime/camera?topic=%2Fcamera%2Fcolor%2Fimage_raw%2Fcompressed",
      "ws://api:8000/api/v1/runtime/camera?topic=%2Fwrist%2Fimage%2Fcompressed",
    ]);
    expect(FakeSocket.opened[0]?.protocols).toEqual(["bloom.runtime.v1", "bloom.api-key.k1"]);
    expect(FakeSocket.opened[0]?.binaryType).toBe("blob");
  });

  it("says whether ROS is behind the stream before the first frame, then shows each frame and frees the last", () => {
    vi.setSystemTime(new Date("2026-09-29T10:00:00Z"));
    const { result } = renderHook(() => useCameraStreams(targets, "http://api:8000"));
    const socket = FakeSocket.opened[0] as FakeSocket;
    act(() => socket.opened(false));
    expect(result.current.gripper).toEqual({ type: "camera-frame", topic: targets[0]?.topic, connected: false });

    act(() => socket.opened(true));
    act(() => socket.frame("first"));
    expect(result.current.gripper).toMatchObject({
      connected: true,
      frameUrl: "blob:frame-1",
      receivedAt: Date.parse("2026-09-29T10:00:00Z"),
    });
    act(() => socket.frame("second"));
    expect(result.current.gripper).toMatchObject({ frameUrl: "blob:frame-2" });
    // Only the frame on screen is still held; the one before it was released.
    expect([...held.keys()]).toEqual(["blob:frame-2"]);
  });

  it("ignores text it does not understand without dropping the stream", () => {
    const { result } = renderHook(() => useCameraStreams(targets, "http://api:8000"));
    const socket = FakeSocket.opened[0] as FakeSocket;
    act(() => socket.onmessage?.({ data: "not json" }));
    act(() => socket.onmessage?.({ data: JSON.stringify({ type: "something_else" }) }));
    expect(result.current.gripper).toBeUndefined();
    act(() => socket.frame());
    expect(result.current.gripper).toMatchObject({ frameUrl: "blob:frame-1", connected: false });
  });

  it("keeps the last frame and the server's reason while it reconnects, and starts the backoff over once reopened", () => {
    const { result } = renderHook(() => useCameraStreams(targets, "http://api:8000"));
    const first = FakeSocket.opened[0] as FakeSocket;
    act(() => first.opened());
    act(() => first.frame());
    act(() => first.onclose?.({ code: 1011, reason: "ROS node stopped" }));
    expect(result.current.gripper).toMatchObject({
      connected: true,
      detail: "ROS node stopped",
      frameUrl: "blob:frame-1",
      reconnecting: true,
    });

    // Three drops back to back push the wait to four seconds.
    act(() => vi.advanceTimersByTime(1000));
    act(() => FakeSocket.opened.at(-1)?.onclose?.({ code: 1006, reason: "" }));
    act(() => vi.advanceTimersByTime(2000));
    act(() => FakeSocket.opened.at(-1)?.onclose?.({ code: 1006, reason: "" }));
    expect(FakeSocket.opened).toHaveLength(3);
    act(() => vi.advanceTimersByTime(3999));
    expect(FakeSocket.opened).toHaveLength(3);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeSocket.opened).toHaveLength(4);

    // Once the backend answers, the next drop waits only a second again.
    act(() => FakeSocket.opened.at(-1)?.opened());
    expect(result.current.gripper).toMatchObject({ connected: true });
    act(() => FakeSocket.opened.at(-1)?.onclose?.({ code: 1006, reason: "" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(FakeSocket.opened).toHaveLength(5);
  });

  it("closes its sockets, cancels the retry and frees every frame when the screen changes", () => {
    const { result, rerender } = renderHook(({ list }) => useCameraStreams(list, "http://api:8000"), {
      initialProps: { list: targets },
    });
    const socket = FakeSocket.opened[0] as FakeSocket;
    act(() => socket.frame());
    expect(held.size).toBe(1);
    // An equal list, rebuilt on a re-render, must not tear the socket down.
    rerender({ list: [{ ...targets[0] }] as typeof targets });
    expect(FakeSocket.opened).toHaveLength(1);
    expect(socket.closedWith).toBeNull();

    rerender({ list: [] });
    expect(socket.closedWith).toEqual([1000, "Screen closed."]);
    expect(held.size).toBe(0);
    expect(result.current).toEqual({});
    // A close the old socket reports after that opens nothing new.
    act(() => vi.advanceTimersByTime(20000));
    expect(FakeSocket.opened).toHaveLength(1);
  });
});
