import { afterEach, describe, expect, it, vi } from "vitest";
import { isSampleStale, localReceivedAt, STALE_VALUE_AFTER_MS } from "./use-now";

// A tablet's clock can sit minutes off the backend's; staleness has to be measured on one clock.
describe("sample age across skewed clocks", () => {
  afterEach(() => vi.useRealTimers());

  it("reads a just-arrived sample as fresh whichever way the backend clock is off", () => {
    vi.useFakeTimers();
    const ahead = new Date(Date.now() + 600_000).toISOString();
    expect(isSampleStale(ahead, Date.now())).toBe(false);
    // Another backend, or this one after its clock stepped back: the first stream went quiet, and the new
    // one advances in step with the tablet's clock.
    vi.advanceTimersByTime(STALE_VALUE_AFTER_MS + 1000);
    localReceivedAt(new Date(Date.now() - 600_100).toISOString());
    vi.advanceTimersByTime(100);
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
  it("reads an older stamp met on a quiet link as old, not fresh", () => {
    vi.useFakeTimers();
    const newest = Date.now() + 100 * 3_600_000;
    localReceivedAt(new Date(newest).toISOString());
    vi.advanceTimersByTime(STALE_VALUE_AFTER_MS + 1000);
    const dead = new Date(newest - 60_000).toISOString();
    expect(isSampleStale(dead, Date.now())).toBe(true);
  });

  it("keeps dead samples a remount meets together old", () => {
    vi.useFakeTimers();
    const newest = Date.now() + 200 * 3_600_000;
    localReceivedAt(new Date(newest).toISOString());
    vi.advanceTimersByTime(STALE_VALUE_AFTER_MS + 1000);
    expect(isSampleStale(new Date(newest - 5_000).toISOString(), Date.now())).toBe(true);
    expect(isSampleStale(new Date(newest - 4_990).toISOString(), Date.now())).toBe(true);
  });

  it("follows a backend clock that stepped back once its stream advances", () => {
    vi.useFakeTimers();
    const newest = Date.now() + 300 * 3_600_000;
    localReceivedAt(new Date(newest).toISOString());
    // The stream never stops; only its stamps jump back.
    const stepped = newest - 600_000;
    for (let tick = 1; tick <= 40; tick += 1) {
      vi.advanceTimersByTime(100);
      localReceivedAt(new Date(stepped + tick * 100).toISOString());
    }
    vi.advanceTimersByTime(100);
    expect(isSampleStale(new Date(stepped + 4_100).toISOString(), Date.now())).toBe(false);
  });

  it("keeps a stamp that is still being read, when the table evicts", () => {
    vi.useFakeTimers();
    const base = Date.now() + 400 * 3_600_000;
    const watched = new Date(base).toISOString();
    const first = localReceivedAt(watched);
    for (let index = 1; index < 4096; index += 1) {
      localReceivedAt(new Date(base + index).toISOString());
    }
    expect(localReceivedAt(watched)).toBe(first);
    localReceivedAt(new Date(base + 4096).toISOString());
    expect(localReceivedAt(watched)).toBe(first);
  });
});
