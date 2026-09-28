/**
 * @vitest-environment jsdom
 */
// A control's own press against the store: what it shows when the reply is lost, superseded, refused, or when
// the socket drops or STOP lands while it is still sending (ADR 0142).
import type { CommandStateEntry } from "@bloom/api-client";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCommandStateMessage,
  type CommandStateMessage,
  clearCommandState,
  PRESS_SENDING_MS,
  resetCommandStateForTests,
  useCommandPress,
  useCommandStateConnected,
} from "./command-state";

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  vi.useRealTimers();
});

const WRITES = [{ key: "manager:behaviour", value: "behaviour/intent_scaling" }];

function entry(value: unknown, revision: number, by: string, source: CommandStateEntry["source"] = "commanded") {
  return { value, revision, by, source, updated_at: "" };
}

function push(revision: number, snapshot: Record<string, CommandStateEntry>) {
  act(() => applyCommandStateMessage({ type: "command_state", revision, self: "me", snapshot }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe("a press whose reply never comes back", () => {
  it("is not confirmed when the send throws, with the error as its reason", () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());

    act(() =>
      result.current.press(WRITES, () => {
        throw new Error("socket closed");
      }),
    );

    expect(result.current.phase).toBe("not-confirmed");
    expect(result.current.detail).toBe("socket closed");
    expect(result.current.asked).toBeNull();
  });

  it("is not confirmed when the send rejects", async () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());
    const reply = deferred<undefined>();

    act(() => result.current.press(WRITES, () => reply.promise));
    expect(result.current.phase).toBe("sending");
    await act(async () => {
      reply.reject(new Error("link down"));
      await Promise.resolve();
    });

    expect(result.current.phase).toBe("not-confirmed");
    expect(result.current.detail).toBe("link down");
  });

  it("keeps sending through a socket drop and gives up after 3 s", () => {
    vi.useFakeTimers();
    push(5, { "manager:behaviour": entry("behaviour/passthrough", 5, "robot", "measured") });
    const { result } = renderHook(() => useCommandPress());

    act(() => result.current.press(WRITES, () => new Promise(() => undefined)));
    expect(result.current.asked).toEqual(WRITES);
    act(() => clearCommandState());

    expect(result.current.phase).toBe("sending");
    act(() => vi.advanceTimersByTime(PRESS_SENDING_MS));
    expect(result.current.phase).toBe("idle");
    expect(result.current.asked).toBeNull();
  });

  it("is answered by the reconnect's snapshot when it carries this screen's write", () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());

    act(() => result.current.press(WRITES, () => new Promise(() => undefined)));
    act(() => clearCommandState());
    push(6, { "manager:behaviour": entry("behaviour/intent_scaling", 6, "me") });

    expect(result.current.phase).toBe("idle");
  });
});

describe("a press the store answers", () => {
  it("stays answered when STOP resets the key right after", () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());

    act(() => result.current.press(WRITES, () => ({ accepted: true })));
    push(6, { "manager:behaviour": entry("behaviour/intent_scaling", 6, "me") });
    expect(result.current.phase).toBe("idle");
    push(7, { "manager:behaviour": entry("behaviour/passthrough", 7, "server", "reset") });

    expect(result.current.phase).toBe("idle");
  });

  it("is not answered by keys nobody bound, however many the snapshot holds", () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());

    act(() => result.current.press(WRITES, () => ({ accepted: true })));
    push(9, {
      "manager:shaping": entry("geometric/both", 6, "me"),
      "param:/cartesian_manager:x": entry(1, 7, "me"),
      "/unbound/topic": entry({ data: 1 }, 8, "other-publisher"),
      "manager:target": entry(null, 9, "server", "unknown"),
    });

    expect(result.current.phase).toBe("sending");
  });
});

describe("a refused press", () => {
  it("shows its reason until the key is written again, not when other keys are", () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());

    act(() => result.current.press(WRITES, () => ({ accepted: false, detail: "Runtime stop is engaged." })));
    expect(result.current.phase).toBe("refused");
    expect(result.current.detail).toBe("Runtime stop is engaged.");

    push(6, { "manager:shaping": entry("geometric/both", 6, "robot", "measured") });
    expect(result.current.phase).toBe("refused");

    push(7, { "manager:behaviour": entry("behaviour/passthrough", 7, "robot", "measured") });
    expect(result.current.phase).toBe("idle");
    expect(result.current.detail).toBeUndefined();
  });

  it("is superseded by a later press of the same control, whose reply is the one that counts", async () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());
    const first = deferred<{ accepted: boolean; detail: string }>();

    act(() => result.current.press(WRITES, () => first.promise));
    act(() => result.current.press([{ key: "manager:behaviour", value: "behaviour/passthrough" }], () => undefined));
    await act(async () => {
      first.resolve({ accepted: false, detail: "too late" });
      await Promise.resolve();
    });

    expect(result.current.phase).toBe("sending");
    expect(result.current.detail).toBeUndefined();
    expect(result.current.asked).toEqual([{ key: "manager:behaviour", value: "behaviour/passthrough" }]);
  });

  it("reads superseded and unknown replies as the server means them", async () => {
    push(5, {});
    const { result } = renderHook(() => useCommandPress());

    act(() => result.current.press(WRITES, () => ({ accepted: false, status: "superseded" })));
    expect(result.current.phase).toBe("sending");

    act(() => result.current.press(WRITES, () => ({ accepted: false, status: "unknown", detail: "no reply" })));
    expect(result.current.phase).toBe("not-confirmed");
    expect(result.current.detail).toBe("no reply");
  });
});

describe("what the store knows of its socket", () => {
  it("is connected from the first snapshot, even an empty one, until the socket closes", () => {
    const { result } = renderHook(() => useCommandStateConnected());
    expect(result.current).toBe(false);

    act(() => applyCommandStateMessage({ type: "command_state", revision: 0 } as CommandStateMessage));
    expect(result.current).toBe(true);

    act(() => clearCommandState());
    expect(result.current).toBe(false);
  });
});
