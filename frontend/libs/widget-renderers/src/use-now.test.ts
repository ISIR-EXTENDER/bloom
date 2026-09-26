import { afterEach, describe, expect, it, vi } from "vitest";
import { isSampleStale, localReceivedAt, STALE_VALUE_AFTER_MS } from "./use-now";

// A tablet's clock can sit minutes off the backend's; staleness has to be measured on one clock.
describe("sample age across skewed clocks", () => {
  afterEach(() => vi.useRealTimers());

  it("reads a just-arrived sample as fresh whichever way the backend clock is off", () => {
    vi.useFakeTimers();
    const ahead = new Date(Date.now() + 600_000).toISOString();
    expect(isSampleStale(ahead, Date.now())).toBe(false);
    // Another backend, or this one after its clock stepped back: the first stream went quiet first.
    vi.advanceTimersByTime(STALE_VALUE_AFTER_MS + 1000);
    const behind = new Date(Date.now() - 600_000).toISOString();
    expect(isSampleStale(behind, Date.now())).toBe(false);
  });

  it("goes stale once nothing new has arrived for the threshold", () => {
    vi.useFakeTimers();
    const stamp = new Date(Date.now() + 3_600_000).toISOString();
    expect(isSampleStale(stamp, Date.now())).toBe(false);
    vi.advanceTimersByTime(STALE_VALUE_AFTER_MS + 1);
    expect(isSampleStale(stamp, Date.now())).toBe(true);
  });

  it("keeps an older sample met later old while newer ones still stream", () => {
    vi.useFakeTimers();
    const newest = new Date(Date.now() + 7_200_000);
    localReceivedAt(newest.toISOString());
    const older = new Date(newest.getTime() - 60_000).toISOString();
    expect(Date.now() - (localReceivedAt(older) ?? 0)).toBe(60_000);
    expect(isSampleStale(older, Date.now())).toBe(true);
  });

  it("times a stamp once, however often it is read", () => {
    vi.useFakeTimers();
    const stamp = new Date(Date.now() + 30 * 3_600_000).toISOString();
    const first = localReceivedAt(stamp);
    vi.advanceTimersByTime(10_000);
    expect(localReceivedAt(stamp)).toBe(first);
  });

  it("has no arrival time for a missing or unreadable stamp", () => {
    expect(localReceivedAt(undefined)).toBeUndefined();
    expect(localReceivedAt("not a time")).toBeUndefined();
    expect(isSampleStale("", Date.now())).toBe(false);
  });
});
