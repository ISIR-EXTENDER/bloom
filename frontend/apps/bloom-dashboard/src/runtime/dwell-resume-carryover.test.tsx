/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeStopControl } from "./RuntimeStopControl";
import { useDwellActivation } from "./use-dwell-activation";

function DwellStop({ onResume }: { onResume: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stopped, setStopped] = useState(false);
  useDwellActivation({ dwellMs: 800, enabled: true, rootRef });
  return (
    <div ref={rootRef}>
      <button type="button">Elsewhere</button>
      <RuntimeStopControl
        onEngage={() => setStopped(true)}
        onResume={() => {
          onResume();
          setStopped(false);
        }}
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
});
