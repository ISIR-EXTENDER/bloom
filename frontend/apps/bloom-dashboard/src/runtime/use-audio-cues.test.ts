import { describe, expect, it } from "vitest";

import { resolveAudioCue } from "./use-audio-cues";

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
