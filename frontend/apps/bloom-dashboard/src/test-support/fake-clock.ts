import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * A fake clock for the scan tests: the scanner, the resume lockout and the holds all run on timers, and sleeping
 * through them in real time flaked under load. `waitFor` and `findBy*` keep working, since Testing Library drives
 * a fake clock through a `jest` global, which is provided while the clock is fake.
 */
export function installFakeClock() {
  vi.useFakeTimers();
  (globalThis as { jest?: unknown }).jest = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };
}

export function uninstallFakeClock() {
  (globalThis as { jest?: unknown }).jest = undefined;
  vi.useRealTimers();
}

/** Lets `ms` pass on the fake clock, firing what is due and flushing the renders it causes. */
export function elapse(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms));
}
