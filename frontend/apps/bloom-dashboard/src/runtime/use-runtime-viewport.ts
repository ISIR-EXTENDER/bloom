import { type RefObject, useEffect, useState } from "react";

export type RuntimeViewportSize = {
  height: number;
  width: number;
};

/** The canvas viewport's inner size, followed through resizes while `active`; the window's size before it mounts. */
export function useViewportSize(viewportRef: RefObject<HTMLDivElement | null>, active: boolean): RuntimeViewportSize {
  const [viewportSize, setViewportSize] = useState<RuntimeViewportSize>(() => getWindowViewportSize());

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!active || !viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize(measureViewportSize(viewport));
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", updateViewportSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [active, viewportRef]);

  return viewportSize;
}

function measureViewportSize(viewport: HTMLDivElement): RuntimeViewportSize {
  const style = window.getComputedStyle(viewport);
  const horizontalPadding = readCssPixelValue(style.paddingLeft) + readCssPixelValue(style.paddingRight);
  const verticalPadding = readCssPixelValue(style.paddingTop) + readCssPixelValue(style.paddingBottom);
  const windowSize = getWindowViewportSize();

  return {
    height: Math.max(1, (viewport.clientHeight || windowSize.height) - verticalPadding),
    width: Math.max(1, (viewport.clientWidth || windowSize.width) - horizontalPadding),
  };
}

/** The window's size, followed through resizes. */
export function useWindowViewportSize(): RuntimeViewportSize {
  const [size, setSize] = useState(getWindowViewportSize);
  useEffect(() => {
    const update = () => setSize(getWindowViewportSize());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

function getWindowViewportSize(): RuntimeViewportSize {
  if (typeof window === "undefined") {
    return { height: 1, width: 1 };
  }

  return {
    height: Math.max(1, window.innerHeight),
    width: Math.max(1, window.innerWidth),
  };
}

function readCssPixelValue(value: string): number {
  const parsedValue = Number.parseFloat(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}
