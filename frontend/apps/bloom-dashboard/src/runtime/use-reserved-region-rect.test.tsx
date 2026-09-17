/**
 * @vitest-environment jsdom
 */
import type { ReservedRegion } from "@bloom/api-client";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReservedRegionRect } from "./use-reserved-region-rect";

const region: ReservedRegion = { height: 100, id: "stop", owner: "runtime-chrome", width: 200, x: 5, y: 0 };

function Probe({ mounted, left }: { mounted: boolean; left: number }) {
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const rect = useReservedRegionRect(region, artboardRef, anchorRef, 1);
  return (
    <>
      {mounted ? (
        <div ref={anchorRef}>
          <div data-left={left} data-testid="artboard" ref={artboardRef} />
        </div>
      ) : null}
      <output data-testid="left">{rect ? rect.left : "none"}</output>
    </>
  );
}

describe("the reserved region rect", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return DOMRect.fromRect({ height: 0, width: 0, x: Number(this.dataset.left ?? 0), y: 0 });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("follows the canvas nodes that remount after settings or the tour close", () => {
    const { rerender } = render(<Probe left={10} mounted />);
    expect(screen.getByTestId("left").textContent).toBe("15");

    rerender(<Probe left={10} mounted={false} />);
    expect(screen.getByTestId("left").textContent).toBe("none");

    rerender(<Probe left={40} mounted />);
    expect(screen.getByTestId("left").textContent).toBe("45");

    screen.getByTestId("artboard").dataset.left = "70";
    act(() => {
      fireEvent(window, new Event("resize"));
    });
    expect(screen.getByTestId("left").textContent).toBe("75");
  });
});
