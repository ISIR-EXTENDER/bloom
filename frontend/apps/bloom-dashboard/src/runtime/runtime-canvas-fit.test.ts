import { describe, expect, it } from "vitest";
import { resolveRuntimeCanvasFit } from "./runtime-canvas-fit";

describe("resolveRuntimeCanvasFit", () => {
  it("reports the actual guarded scale when a fit canvas shrinks", () => {
    expect(
      resolveRuntimeCanvasFit(
        { preset_id: "wide-tablet", runtime_mode: "fit" },
        { width: 1820, height: 720 },
        { width: 1280, height: 676 },
      ),
    ).toEqual({
      scale: (1280 / 1820) * 0.99,
      warning: { authoredHeight: 720, authoredWidth: 1820, shownPercent: 70 },
    });
  });

  it("does not warn solely because the overflow guard renders a one-to-one canvas at 99 percent", () => {
    expect(
      resolveRuntimeCanvasFit(
        { preset_id: "native-1280x720", runtime_mode: "fit" },
        { width: 1280, height: 720 },
        { width: 1280, height: 720 },
      ),
    ).toEqual({ scale: 0.99, warning: null });
  });

  it("leaves a centered canvas at authored size without a warning", () => {
    expect(
      resolveRuntimeCanvasFit(
        { preset_id: "wide-tablet", runtime_mode: "center" },
        { width: 1820, height: 720 },
        { width: 1280, height: 676 },
      ),
    ).toEqual({ scale: 1, warning: null });
  });
});
