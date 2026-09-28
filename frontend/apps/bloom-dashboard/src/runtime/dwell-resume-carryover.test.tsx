/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeStopControl } from "./RuntimeStopControl";
import { useDwellActivation } from "./use-dwell-activation";

function DwellStop({
  dwellMode = false,
  dwellMs = 800,
  onResume,
}: {
  dwellMode?: boolean;
  dwellMs?: number;
  onResume: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stopped, setStopped] = useState(false);
  useDwellActivation({ dwellMs, enabled: true, rootRef });
  return (
    <div ref={rootRef}>
      <button type="button">Elsewhere</button>
      <RuntimeStopControl
        onEngage={() => setStopped(true)}
        onResume={() => {
          onResume();
          setStopped(false);
        }}
        dwellMode={dwellMode}
        requestError=""
        stopped={stopped}
      />
    </div>
  );
}

function move(element: Element, x: number, y: number) {
  act(() => {
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
  });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("dwell on STOP and Resume", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanup();
  });

  it("does not carry a rest that fired STOP onto Resume, so one glance away and back cannot resume", () => {
    const onResume = vi.fn();
    render(<DwellStop onResume={onResume} />);
    move(screen.getByRole("button", { name: "Stop the robot" }), 100, 100);
    advance(1000);
    const resume = screen.getByRole("button", { name: /Hold for one second to resume/ });

    // Tremor on the Resume that replaced STOP under the pointer: not a new rest.
    move(resume, 102, 101);
    advance(1200);
    expect(screen.queryByRole("button", { name: /Press again to resume/ })).toBeNull();

    // One glance away and back is one deliberate rest: it arms, it does not resume.
    move(screen.getByRole("button", { name: "Elsewhere" }), 300, 100);
    move(resume, 100, 100);
    advance(1100);
    expect(screen.getByRole("button", { name: /Press again to resume/ })).toBeTruthy();
    expect(onResume).not.toHaveBeenCalled();

    // A second deliberate rest confirms.
    move(screen.getByRole("button", { name: "Elsewhere" }), 300, 100);
    move(resume, 100, 100);
    advance(1100);
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("does not arm Resume by dwell right after the latch appears", () => {
    const onResume = vi.fn();
    render(<DwellStop onResume={onResume} />);
    // A tap stops; the pointer is already resting where Resume appears.
    act(() => {
      screen
        .getByRole("button", { name: "Stop the robot" })
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    const resume = screen.getByRole("button", { name: /Hold for one second to resume/ });
    move(resume, 50, 50);
    advance(1100);

    expect(screen.queryByRole("button", { name: /Press again to resume/ })).toBeNull();
    expect(onResume).not.toHaveBeenCalled();
  });
  it.each([800, 1600])("does not resume on tremor across STOP's edge (dwell %i ms)", (dwellMs) => {
    // STOP spans 0..100; a rest parked at x=99 drifts 2 px over the edge and back.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const onResume = vi.fn();
    const { container } = render(<DwellStop dwellMs={dwellMs} onResume={onResume} />);
    const root = container.firstElementChild as HTMLElement;
    move(screen.getByRole("button", { name: "Stop the robot" }), 99, 50);
    advance(dwellMs + 200);
    const resume = screen.getByRole("button", { name: /Hold for one second to resume/ });

    for (let cycle = 0; cycle < 6; cycle += 1) {
      move(root, 101, 50);
      advance(1800);
      move(resume, 99, 50);
      advance(1800);
    }
    expect(screen.queryByRole("button", { name: /Press again to resume/ })).toBeNull();
    expect(onResume).not.toHaveBeenCalled();

    // A deliberate move away and back still arms and confirms.
    move(screen.getByRole("button", { name: "Elsewhere" }), 300, 50);
    move(resume, 99, 50);
    advance(dwellMs + 200);
    expect(screen.getByRole("button", { name: /Press again to resume/ })).toBeTruthy();
    move(screen.getByRole("button", { name: "Elsewhere" }), 300, 50);
    move(resume, 99, 50);
    advance(dwellMs + 200);
    expect(onResume).toHaveBeenCalledOnce();
  });

  // Drift, not a deliberate act: the carry-over held only 6 px from the fire point, so it armed and confirmed.
  it("does not arm or confirm Resume on drift that stays on the control", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const onResume = vi.fn();
    const { container } = render(<DwellStop onResume={onResume} />);
    const root = container.firstElementChild as HTMLElement;
    move(screen.getByRole("button", { name: "Stop the robot" }), 90, 50);
    advance(1000);
    const resume = screen.getByRole("button", { name: /Hold for one second to resume/ });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      move(resume, 97, 51);
      advance(1300);
      move(root, 104, 50);
      advance(300);
      move(resume, 99, 49);
      advance(1300);
      move(resume, 84, 52);
      advance(1300);
    }
    expect(screen.queryByRole("button", { name: /Press again to resume/ })).toBeNull();
    expect(onResume).not.toHaveBeenCalled();
  });

  it("releases the carry-over once the pointer stays off the control for a dwell time", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const onResume = vi.fn();
    const { container } = render(<DwellStop onResume={onResume} />);
    const root = container.firstElementChild as HTMLElement;
    move(screen.getByRole("button", { name: "Stop the robot" }), 90, 50);
    advance(1000);
    const resume = screen.getByRole("button", { name: /Hold for one second to resume/ });

    // 12 px off, inside the margin: a short visit keeps it, one dwell time releases it.
    move(root, 112, 50);
    advance(300);
    move(resume, 95, 50);
    advance(1300);
    expect(screen.queryByRole("button", { name: /Press again to resume/ })).toBeNull();
    move(root, 112, 50);
    advance(500);
    move(root, 113, 51);
    advance(400);
    move(resume, 95, 50);
    advance(1300);
    expect(screen.getByRole("button", { name: /Press again to resume/ })).toBeTruthy();
  });

  // A rest inside the post-latch quiet window was eaten silently, and only leaving and returning tried again.
  it("says Resume is not listening yet, and arms from the same rest once it is", () => {
    const onResume = vi.fn();
    render(<DwellStop dwellMode onResume={onResume} />);
    move(screen.getByRole("button", { name: "Stop the robot" }), 100, 100);
    advance(800);
    const resume = screen.getByRole("button", { name: /Resume listens in a moment/ });
    expect(resume.textContent).toContain("ONE MOMENT…");

    move(screen.getByRole("button", { name: "Elsewhere" }), 300, 100);
    advance(80);
    move(resume, 100, 101);
    advance(40);
    move(resume, 101, 100);
    advance(1100);
    expect(screen.queryByRole("button", { name: /Press again to resume/ })).toBeNull();
    advance(500);
    expect(screen.getByRole("button", { name: /Press again to resume/ })).toBeTruthy();
    expect(onResume).not.toHaveBeenCalled();

    move(screen.getByRole("button", { name: "Elsewhere" }), 300, 100);
    move(resume, 100, 100);
    advance(1100);
    expect(onResume).toHaveBeenCalledOnce();
  });
});
