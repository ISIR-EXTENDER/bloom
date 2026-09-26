/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAudioCue, useAudioCues } from "./use-audio-cues";

describe("audio cue resolution", () => {
  it("sounds the stop the moment the chip turns stopped", () => {
    expect(resolveAudioCue("ready", "stopped")).toBe("stop");
  });

  it("sounds a falling pair when the link dies", () => {
    expect(resolveAudioCue("ready", "link-down")).toBe("link-down");
  });

  it("announces recovery only after something was wrong", () => {
    expect(resolveAudioCue("link-down", "ready")).toBe("ready");
    expect(resolveAudioCue("stopped", "ready")).toBe("ready");
    expect(resolveAudioCue("connecting", "ready")).toBeNull();
  });

  it("stays silent when nothing changed", () => {
    expect(resolveAudioCue("ready", "ready")).toBeNull();
    expect(resolveAudioCue(undefined, undefined)).toBeNull();
  });
});

describe("audio cue unlocking", () => {
  afterEach(() => vi.unstubAllGlobals());

  // A switch box or head pointer sends keys, never a touch: STOP and LINK DOWN stayed silent for them.
  it("unlocks on a key press, so a switch user hears STOP", () => {
    const start = vi.fn();
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      state = "suspended";
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
      createOscillator() {
        return { connect: (node: unknown) => node, frequency: {}, start, stop: vi.fn() };
      }
      createGain() {
        return {
          connect: (node: unknown) => node,
          gain: { exponentialRampToValueAtTime: vi.fn(), setValueAtTime: vi.fn() },
        };
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const { rerender } = renderHook(({ tone }) => useAudioCues(tone, true), {
      initialProps: { tone: "ready" as "ready" | "stopped" },
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    rerender({ tone: "stopped" });

    expect(start).toHaveBeenCalled();
  });
});
