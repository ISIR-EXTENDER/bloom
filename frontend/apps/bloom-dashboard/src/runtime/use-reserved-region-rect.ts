import type { ReservedRegion, ScreenConfig } from "@bloom/api-client";
import { type RefObject, useLayoutEffect, useState } from "react";

export type RegionRect = { height: number; left: number; top: number; width: number };

export function findRuntimeRegion(screen: ScreenConfig, id: string): ReservedRegion | null {
  return screen.reserved_regions?.find((region) => region.id === id && region.owner === "runtime-chrome") ?? null;
}

export function findStopRegion(screen: ScreenConfig): ReservedRegion | null {
  return findRuntimeRegion(screen, "stop");
}

/**
 * Where a reserved region lands inside `anchor`, following the scaled artboard. STOP is drawn outside the
 * artboard so it never inherits the canvas' inert or stopped state.
 */
export function useReservedRegionRect(
  region: ReservedRegion | null,
  artboardRef: RefObject<HTMLElement | null>,
  anchorRef: RefObject<HTMLElement | null>,
  scale: number,
): RegionRect | null {
  const [rect, setRect] = useState<RegionRect | null>(null);
  const [nodes, setNodes] = useState<{ anchor: HTMLElement | null; artboard: HTMLElement | null }>({
    anchor: null,
    artboard: null,
  });

  // Settings and the tour unmount the canvas; the remounted nodes must get the listeners, not the detached ones.
  useLayoutEffect(() => {
    const artboard = artboardRef.current;
    const anchor = anchorRef.current;
    setNodes((current) =>
      current.artboard === artboard && current.anchor === anchor ? current : { anchor, artboard },
    );
  });

  useLayoutEffect(() => {
    const { anchor, artboard } = nodes;
    if (!region || !artboard || !anchor) {
      setRect(null);
      return;
    }
    const measure = () => {
      const origin = artboard.getBoundingClientRect();
      const bounds = anchor.getBoundingClientRect();
      const next = {
        height: region.height * scale,
        left: origin.left - bounds.left + region.x * scale,
        top: origin.top - bounds.top + region.y * scale,
        width: region.width * scale,
      };
      setRect((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(artboard);
    observer?.observe(anchor);
    window.addEventListener("resize", measure);
    anchor.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      anchor.removeEventListener("scroll", measure, true);
    };
  }, [nodes, region, scale]);

  return rect;
}
