/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useStopSheetInset } from "./use-stop-sheet-inset";

describe("the STOP sheet inset", () => {
  it("measures when STOP moves or the window resizes, not on every render", () => {
    const shell = document.createElement("div");
    const measure = vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({ left: 100 } as DOMRect);
    const shellRef = { current: shell };
    const first = { height: 50, left: 600, top: 0, width: 50 };
    const { result, rerender } = renderHook(({ rect }) => useStopSheetInset(rect, shellRef, 202), {
      initialProps: { rect: first },
    });
    expect(result.current).toBe(window.innerWidth - 700 + 14);

    rerender({ rect: first });
    rerender({ rect: first });
    expect(measure).toHaveBeenCalledTimes(1);

    rerender({ rect: { ...first, left: 500 } });
    expect(result.current).toBe(window.innerWidth - 600 + 14);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(measure).toHaveBeenCalledTimes(3);
  });

  it("falls back to the corner without a STOP region", () => {
    const { result } = renderHook(() => useStopSheetInset(null, { current: null }, 202));
    expect(result.current).toBe(202);
  });
});
