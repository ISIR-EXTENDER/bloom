import { useEffect, useRef } from "react";

import type { RuntimeStatusChipTone } from "./RuntimeKioskBar";

export type AudioCue = "link-down" | "ready" | "stop";

/** Which cue a chip transition deserves; the operator's eyes are on the gripper. */
export function resolveAudioCue(
  previous: RuntimeStatusChipTone | undefined,
  next: RuntimeStatusChipTone | undefined,
): AudioCue | null {
  if (previous === next || next === undefined) {
    return null;
  }
  if (next === "stopped") {
    return "stop";
  }
  if (next === "link-down") {
    return "link-down";
  }
  // Recovery is only news after something was wrong.
  if (next === "ready" && (previous === "link-down" || previous === "stopped")) {
    return "ready";
  }
  return null;
}

// Distinct shapes, not just pitches: stop is two low pulses, link-down a
// falling pair, ready a rising pair.
const CUE_NOTES: Record<AudioCue, Array<{ at: number; hz: number; ms: number }>> = {
  stop: [
    { at: 0, hz: 220, ms: 120 },
    { at: 0.16, hz: 220, ms: 180 },
  ],
  "link-down": [
    { at: 0, hz: 620, ms: 110 },
    { at: 0.13, hz: 420, ms: 170 },
  ],
  ready: [
    { at: 0, hz: 420, ms: 90 },
    { at: 0.11, hz: 620, ms: 140 },
  ],
};

export function useAudioCues(tone: RuntimeStatusChipTone | undefined, enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const previousToneRef = useRef<RuntimeStatusChipTone | undefined>(tone);

  // Browsers refuse audio before a user gesture; a key counts too, for keyboard, switch and head-pointer users.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const unlock = () => {
      try {
        contextRef.current = contextRef.current ?? new AudioContext();
        void contextRef.current.resume();
      } catch {
        contextRef.current = null;
      }
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, [enabled]);

  useEffect(
    () => () => {
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const previous = previousToneRef.current;
    previousToneRef.current = tone;
    if (!enabled) {
      return;
    }
    const cue = resolveAudioCue(previous, tone);
    const context = contextRef.current;
    if (!cue || !context || context.state !== "running") {
      return;
    }
    for (const note of CUE_NOTES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = note.hz;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.12, context.currentTime + note.at);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + note.at + note.ms / 1000);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + note.at);
      oscillator.stop(context.currentTime + note.at + note.ms / 1000);
    }
  }, [enabled, tone]);
}
