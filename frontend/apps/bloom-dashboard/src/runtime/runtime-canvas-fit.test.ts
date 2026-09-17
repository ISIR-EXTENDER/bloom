import type { ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { resolveRuntimeArtboardSize, resolveRuntimeCanvasFit } from "./runtime-canvas-fit";

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

  it("draws a screen that reserves regions for the whole panel body at one to one", () => {
    const screen = {
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      id: "drive",
      reserved_regions: [{ height: 252, id: "stop", owner: "runtime-chrome", width: 338, x: 928, y: 410 }],
      title: "Drive",
      widgets: [
        { id: "pad", kind: "joystick", layout: { height: 384, width: 1252, x: 14, y: 146 }, settings: {}, title: "" },
      ],
    } as ScreenConfig;

    const size = resolveRuntimeArtboardSize(screen);
    expect(size).toEqual({ width: 1280, height: 676 });
    expect(resolveRuntimeCanvasFit(screen.canvas, size, { width: 1280, height: 676 }, true)).toEqual({
      scale: 1,
      warning: null,
    });
    expect(resolveRuntimeCanvasFit(screen.canvas, size, { width: 1024, height: 556 }, true).scale).toBe(0.8);
    expect(resolveRuntimeArtboardSize({ ...screen, reserved_regions: [] })).toEqual({ width: 1290, height: 720 });
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
