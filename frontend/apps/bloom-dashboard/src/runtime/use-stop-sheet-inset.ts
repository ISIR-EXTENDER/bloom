import { type RefObject, useLayoutEffect, useState } from "react";
import type { RegionRect } from "./use-reserved-region-rect";

/** The room a sheet leaves on its right for STOP: measured on layout and resize, not every render. */
export function useStopSheetInset(
  stopRect: RegionRect | null,
  shellRef: RefObject<HTMLElement | null>,
  fallbackInset: number,
): number {
  const [inset, setInset] = useState(fallbackInset);
  useLayoutEffect(() => {
    const measure = () => {
      const shell = shellRef.current;
      const next =
        stopRect && shell
          ? Math.max(0, window.innerWidth - (shell.getBoundingClientRect().left + stopRect.left) + 14)
          : fallbackInset;
      setInset((current) => (current === next ? current : next));
    };
    measure();
    const shell = shellRef.current;
    const observer = shell && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (shell) {
      observer?.observe(shell);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fallbackInset, shellRef, stopRect]);
  return inset;
}
