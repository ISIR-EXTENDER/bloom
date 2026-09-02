/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JoystickPrimitive } from "./JoystickPrimitive";

/**
 * The joystick captures the pointer on pointerdown so a drag that leaves the
 * pad keeps steering. If the capture is never released, the element keeps
 * receiving every pointer event on the page, and clicks meant for other widgets
 * go nowhere. In the builder that shows up as "sometimes I cannot click another
 * widget".
 *
 * A browser fires `lostpointercapture` when it takes capture away, which happens
 * when the captured element is moved or re-rendered mid-gesture. That is routine
 * in the builder, where selecting a widget re-renders it.
 */
function renderJoystick() {
  const onInteractionEnd = vi.fn();
  render(
    <JoystickPrimitive
      deadzone={0}
      labels={{ bottom: "Y-", left: "X-", right: "X+", top: "Y+" }}
      onInteractionEnd={onInteractionEnd}
      onVectorChange={vi.fn()}
      size={200}
      title="Translation"
      zeroOnRelease
    />,
  );
  // The pointer handlers live on the inner zone, not the labelled container.
  const container = screen.getByRole("application", { name: "Translation" });
  const pad = container.querySelector(".bloom-joystick-zone") as HTMLElement;
  if (!pad) throw new Error("joystick zone not found");
  // jsdom implements neither, so model a browser that grants and revokes capture
  const captured = new Set<number>();
  pad.setPointerCapture = (id: number) => void captured.add(id);
  pad.releasePointerCapture = (id: number) => void captured.delete(id);
  pad.hasPointerCapture = (id: number) => captured.has(id);
  return { pad, captured, onInteractionEnd };
}

describe("joystick pointer capture", () => {
  afterEach(cleanup);

  it("captures on pointer down and releases on pointer up", () => {
    const { pad, captured, onInteractionEnd } = renderJoystick();

    fireEvent.pointerDown(pad, { pointerId: 1 });
    expect(captured.has(1)).toBe(true);

    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(captured.has(1)).toBe(false);
    expect(onInteractionEnd).toHaveBeenCalled();
  });

  it("ends the interaction when the browser takes the capture away", () => {
    // Without handling this the pad keeps a stale pointer id, keeps reporting an
    // interaction in progress, and swallows clicks aimed elsewhere.
    const { pad, captured, onInteractionEnd } = renderJoystick();

    fireEvent.pointerDown(pad, { pointerId: 1 });
    captured.delete(1); // the browser revoked it
    fireEvent.lostPointerCapture(pad, { pointerId: 1 });

    expect(onInteractionEnd).toHaveBeenCalled();
  });

  it("accepts a fresh gesture after a lost capture", () => {
    const { pad, captured } = renderJoystick();

    fireEvent.pointerDown(pad, { pointerId: 1 });
    captured.delete(1);
    fireEvent.lostPointerCapture(pad, { pointerId: 1 });

    fireEvent.pointerDown(pad, { pointerId: 2 });
    expect(captured.has(2)).toBe(true);
  });
});
