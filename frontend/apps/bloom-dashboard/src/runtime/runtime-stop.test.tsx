/**
 * @vitest-environment jsdom
 */
import type { RuntimeStopState } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeStopControl } from "./RuntimeStopControl";
import { resolveRuntimeStatusChip } from "./runtime-status-chip";
import { getRuntimeStrings } from "./strings";
import { findStopRegion } from "./use-reserved-region-rect";
import { type RuntimeStopClient, useRuntimeStop } from "./use-runtime-stop";

const running: RuntimeStopState = {
  stopped: false,
  asserted: false,
  engaged_at: "",
  detail: "Runtime stop is not engaged.",
};
const stoppedState: RuntimeStopState = {
  stopped: true,
  asserted: true,
  engaged_at: "2026-09-15T10:00:00+00:00",
  detail: "Runtime stop engaged.",
};
const failedStopState: RuntimeStopState = {
  stopped: true,
  asserted: false,
  engaged_at: "2026-09-15T10:00:00+00:00",
  detail: "Runtime stop latched, but ROS assertion failed. Zero velocity could not be published.",
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

  // STOP and Resume are two elements; the swap dropped a keyboard operator's focus to the page.
  it("keeps keyboard focus on the control through STOP and back", () => {
    const handlers = { onEngage: vi.fn(), onResume: vi.fn() };
    const { rerender } = render(<RuntimeStopControl requestError="" stopped={false} {...handlers} />);
    const stop = screen.getByRole("button", { name: "Stop the robot" });
    stop.focus();

    fireEvent.click(stop, { detail: 0 });
    rerender(<RuntimeStopControl requestError="" stopped={true} {...handlers} />);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Hold for one second to resume/ }));
  });

  it("does not pull focus back after a keyboard tap on Resume that let go early", () => {
    const handlers = { onEngage: vi.fn(), onResume: vi.fn() };
    const { rerender } = render(
      <>
        <input aria-label="elsewhere" />
        <RuntimeStopControl requestError="" stopped={true} {...handlers} />
      </>,
    );
    const resume = screen.getByRole("button", { name: /Hold for one second to resume/ });
    fireEvent.keyDown(resume, { key: "Enter" });
    fireEvent.keyUp(resume, { key: "Enter" });
    const elsewhere = screen.getByLabelText("elsewhere");
    elsewhere.focus();

    // Another station resumes.
    rerender(
      <>
        <input aria-label="elsewhere" />
        <RuntimeStopControl requestError="" stopped={false} {...handlers} />
      </>,
    );

    expect(document.activeElement).toBe(elsewhere);
  });

  it("says a failed STOP in its accessible name, not only on screen", () => {
    renderControl({ requestError: "The stop request failed." });

    expect(screen.getByRole("button", { name: "Stop the robot. The stop request failed." })).toBeTruthy();
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

  // Another station resumed mid-hold and the operator pressed STOP again: the old hold resumed the robot.
  it("drops a resume hold when the latch changes under it", () => {
    const handlers = { onEngage: vi.fn(), onResume: vi.fn() };
    const { rerender } = render(<RuntimeStopControl requestError="" stopped={true} {...handlers} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold for one second to resume" }));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    rerender(<RuntimeStopControl requestError="" stopped={false} {...handlers} />);
    rerender(<RuntimeStopControl requestError="" stopped={true} {...handlers} />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(handlers.onResume).not.toHaveBeenCalled();
  });

  it("drops a keyboard resume hold when focus leaves before the key is released", () => {
    const handlers = renderControl({ stopped: true });
    const button = screen.getByRole("button", { name: "Hold for one second to resume" });

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.blur(button);
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(handlers.onResume).not.toHaveBeenCalled();
  });

  it("keeps resume inert when this session does not own control", () => {
    const handlers = renderControl({
      resumeDisabled: true,
      resumeDisabledReason: "Take control before resuming the robot.",
      stopped: true,
    });
    const button = screen.getByRole("button", { name: /Hold for one second to resume/ });

    expect(button).toBeDisabled();
    expect(screen.getByText("Take control before resuming the robot.")).toBeVisible();
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(handlers.onResume).not.toHaveBeenCalled();
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

  it("takes the screen's reserved region, stopped or not", () => {
    const region = { height: 224, left: 826, top: 365, width: 301 };
    renderControl({ region });
    const stop = screen.getByRole("button");
    expect(stop.getAttribute("data-placement")).toBe("region");
    expect(stop).toHaveStyle({ height: "224px", left: "826px", top: "365px", width: "301px" });

    cleanup();
    renderControl({ region, stopped: true });
    expect(screen.getByRole("button").getAttribute("data-placement")).toBe("region");
    expect(screen.getByRole("button")).toHaveStyle({ left: "826px" });
  });

  it("finds the stop region a screen reserves for runtime chrome", () => {
    const stop = { id: "stop", owner: "runtime-chrome" as const, x: 928, y: 410, width: 338, height: 252 };
    const screenOf = (reserved_regions?: (typeof stop)[]) =>
      ({
        canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
        id: "s",
        reserved_regions,
        title: "S",
        widgets: [],
      }) as never;

    expect(findStopRegion(screenOf([stop]))).toBe(stop);
    expect(findStopRegion(screenOf([{ ...stop, id: "banner" }]))).toBeNull();
    expect(findStopRegion(screenOf())).toBeNull();
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

  it("reads HELD FOR MAINTENANCE while maintenance holds the robot, below STOPPED and LINK DOWN", () => {
    expect(
      resolveRuntimeStatusChip(running, settledLink("connected"), undefined, { heldForMaintenance: true }),
    ).toEqual({
      label: "HELD FOR MAINTENANCE",
      tone: "held",
    });
    expect(
      resolveRuntimeStatusChip(stoppedState, settledLink("connected"), undefined, { heldForMaintenance: true })?.tone,
    ).toBe("stopped");
    expect(
      resolveRuntimeStatusChip(running, settledLink("disconnected"), undefined, { heldForMaintenance: true })?.tone,
    ).toBe("link-down");
  });

  it("reads NOT IN CONTROL while another session owns the robot, below STOPPED and LINK DOWN", () => {
    expect(resolveRuntimeStatusChip(running, settledLink("connected"), undefined, { notInControl: true })).toEqual({
      label: "NOT IN CONTROL",
      tone: "not-in-control",
    });
    expect(
      resolveRuntimeStatusChip(running, settledLink("connected"), getRuntimeStrings("fr"), {
        heldForMaintenance: true,
        notInControl: true,
      }),
    ).toEqual({ label: "SANS CONTRÔLE", tone: "not-in-control" });
    expect(
      resolveRuntimeStatusChip(stoppedState, settledLink("connected"), undefined, { notInControl: true })?.tone,
    ).toBe("stopped");
    expect(
      resolveRuntimeStatusChip(running, settledLink("disconnected"), undefined, { notInControl: true })?.tone,
    ).toBe("link-down");
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
        <span data-testid="requested">{String(stop.stopRequested)}</span>
        <button onClick={stop.engage} type="button">
          engage
        </button>
        <button onClick={stop.resume} type="button">
          resume
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
    // Motion is refused meanwhile: the teleop socket still streams while the request travels.
    expect(screen.getByTestId("requested").textContent).toBe("true");

    await act(async () => {
      confirmLatch(stoppedState);
    });
    expect(screen.getByTestId("stopped").textContent).toBe("true");
    expect(screen.getByTestId("requested").textContent).toBe("false");
  });

  // A poll sent before STOP answered after it and showed the robot running for a whole poll period.
  it("ignores a status reply to a poll sent before STOP", async () => {
    let answerPoll: (state: RuntimeStopState) => void = () => {};
    const client: RuntimeStopClient = {
      getRuntimeStopState: () =>
        new Promise((resolve) => {
          answerPoll = resolve;
        }),
      engageRuntimeStop: () => Promise.resolve(stoppedState),
    };
    render(<Probe client={client} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "engage" }));
    });
    expect(screen.getByTestId("stopped").textContent).toBe("true");
    await act(async () => {
      answerPoll(running);
    });

    expect(screen.getByTestId("stopped").textContent).toBe("true");
  });

  it("keeps holding the controls when the stop request cannot reach the backend, until Resume", async () => {
    const client: RuntimeStopClient = {
      getRuntimeStopState: vi.fn().mockResolvedValueOnce(running).mockRejectedValue(new Error("offline")),
      engageRuntimeStop: () => Promise.reject(new Error("offline")),
      resumeRuntimeStop: () => Promise.resolve(running),
    };
    render(<Probe client={client} />);
    await waitFor(() => expect(screen.getByTestId("stopped").textContent).toBe("false"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "engage" }));
    });
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("offline"));
    expect(screen.getByTestId("requested").textContent).toBe("true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "resume" }));
    });
    expect(screen.getByTestId("requested").textContent).toBe("false");
  });

  it("surfaces a failed assertion and immediately mirrors the latched state", async () => {
    const getRuntimeStopState = vi.fn().mockResolvedValueOnce(running).mockResolvedValue(failedStopState);
    const client: RuntimeStopClient = {
      getRuntimeStopState,
      engageRuntimeStop: () => Promise.reject(new Error("Bloom API request failed with status 503")),
    };
    render(<Probe client={client} />);
    await waitFor(() => expect(screen.getByTestId("stopped").textContent).toBe("false"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "engage" }));
    });

    await waitFor(() => expect(screen.getByTestId("stopped").textContent).toBe("true"));
    expect(screen.getByTestId("error").textContent).toBe(failedStopState.detail);
  });
});
