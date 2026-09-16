/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeStopControl } from "./RuntimeStopControl";
import { resolveRuntimeStatusChip } from "./runtime-status-chip";
import { type RuntimeStopClient, useRuntimeStop } from "./use-runtime-stop";

const running: RuntimeStopState = { stopped: false, engaged_at: "", detail: "Runtime stop is not engaged." };
const stoppedState: RuntimeStopState = {
  stopped: true,
  engaged_at: "2026-09-15T10:00:00+00:00",
  detail: "Runtime stop engaged.",
};

describe("the STOP control", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function renderControl(overrides: Partial<Parameters<typeof RuntimeStopControl>[0]> = {}) {
    const handlers = { onEngage: vi.fn(), onResume: vi.fn() };
    render(<RuntimeStopControl requestError="" stopped={false} {...handlers} {...overrides} />);
    return handlers;
  }

  it("stops the instant the finger lands, before any release", () => {
    const handlers = renderControl();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Stop the robot" }));

    expect(handlers.onEngage).toHaveBeenCalledTimes(1);
  });

  it("resumes only after a full 1s hold", () => {
    const handlers = renderControl({ stopped: true });
    const button = screen.getByRole("button", { name: "Hold for one second to resume" });

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(handlers.onResume).toHaveBeenCalledTimes(1);
  });

  it("treats an early release as nothing, with progress reset to zero", () => {
    const handlers = renderControl({ stopped: true });
    const button = screen.getByRole("button", { name: "Hold for one second to resume" });

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.pointerUp(button);
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.pointerUp(button);

    expect(handlers.onResume).not.toHaveBeenCalled();
  });

  it("says why a stop request failed, where the finger just was", () => {
    renderControl({ requestError: "Bloom API request failed with status 502" });

    expect(screen.getByText("Bloom API request failed with status 502")).toBeTruthy();
  });

  it("uses the selected profile language", () => {
    renderControl({ language: "fr", stopped: true });

    expect(screen.getByRole("button", { name: "Maintenir une seconde pour reprendre" }).textContent).toContain(
      "MAINTENIR POUR REPRENDRE",
    );
  });
});

describe("the status chip", () => {
  const settledLink = (state: "connected" | "connecting" | "disconnected") => ({ state, settled: true }) as const;

  it("puts STOPPED above everything, including a dead link", () => {
    expect(resolveRuntimeStatusChip(stoppedState, settledLink("disconnected"))).toEqual({
      label: "STOPPED",
      tone: "stopped",
    });
  });

  it("reads READY when the link is open and nothing is stopped", () => {
    expect(resolveRuntimeStatusChip(running, settledLink("connected"))).toEqual({ label: "READY", tone: "ready" });
  });

  it("reads LINK DOWN when a link that once worked has died", () => {
    expect(resolveRuntimeStatusChip(running, settledLink("disconnected"))).toEqual({
      label: "LINK DOWN",
      tone: "link-down",
    });
  });

  it("keeps reading LINK DOWN through reconnect attempts", () => {
    expect(resolveRuntimeStatusChip(running, settledLink("connecting"))).toEqual({
      label: "LINK DOWN",
      tone: "link-down",
    });
  });

  it("reads CONNECTING only before the link has ever settled", () => {
    expect(resolveRuntimeStatusChip(null, { state: "connecting", settled: false })).toEqual({
      label: "CONNECTING",
      tone: "connecting",
    });
  });

  it("shows nothing where there is no runtime session to describe", () => {
    expect(resolveRuntimeStatusChip(null, { state: null, settled: false })).toBeUndefined();
  });
});

describe("the stop mirror", () => {
  afterEach(cleanup);

  function Probe({ client }: { client: RuntimeStopClient }) {
    const stop = useRuntimeStop(client);
    return (
      <div>
        <span data-testid="stopped">{stop.state === null ? "unknown" : String(stop.state.stopped)}</span>
        <span data-testid="error">{stop.requestError}</span>
        <button onClick={stop.engage} type="button">
          engage
        </button>
      </div>
    );
  }

  it("mirrors the backend's latch on mount", async () => {
    render(<Probe client={{ getRuntimeStopState: () => Promise.resolve(stoppedState) }} />);

    await waitFor(() => expect(screen.getByTestId("stopped").textContent).toBe("true"));
  });

  it("never flips to stopped before the backend confirms the latch", async () => {
    let confirmLatch: (state: RuntimeStopState) => void = () => {};
    const client: RuntimeStopClient = {
      getRuntimeStopState: () => Promise.resolve(running),
      engageRuntimeStop: () =>
        new Promise((resolve) => {
          confirmLatch = resolve;
        }),
    };
    render(<Probe client={client} />);
    await waitFor(() => expect(screen.getByTestId("stopped").textContent).toBe("false"));

    fireEvent.click(screen.getByRole("button", { name: "engage" }));
    expect(screen.getByTestId("stopped").textContent).toBe("false");

    await act(async () => {
      confirmLatch(stoppedState);
    });
    expect(screen.getByTestId("stopped").textContent).toBe("true");
  });

  it("surfaces a failed engage and keeps the last confirmed state", async () => {
    const client: RuntimeStopClient = {
      getRuntimeStopState: () => Promise.resolve(running),
      engageRuntimeStop: () => Promise.reject(new Error("Bloom API request failed with status 502")),
    };
    render(<Probe client={client} />);
    await waitFor(() => expect(screen.getByTestId("stopped").textContent).toBe("false"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "engage" }));
    });

    expect(screen.getByTestId("error").textContent).toBe("Bloom API request failed with status 502");
    expect(screen.getByTestId("stopped").textContent).toBe("false");
  });
});
