import type { WidgetLayout } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import { moveWidgetLayout, parseScaleFromTransform, resizeWidgetLayout } from "./builderLayout";

const baseLayout: WidgetLayout = {
  height: 80,
  width: 120,
  x: 24,
  y: 32,
};

describe("builderLayout", () => {
  it("moves widgets on the editor grid", () => {
    expect(moveWidgetLayout(baseLayout, { dx: 11, dy: 13 }, { width: 500, height: 400 })).toEqual({
      ...baseLayout,
      x: 32,
      y: 48,
    });
  });

  it("keeps moved widgets inside the canvas", () => {
    expect(moveWidgetLayout(baseLayout, { dx: 500, dy: 500 }, { width: 240, height: 160 })).toEqual({
      ...baseLayout,
      x: 120,
      y: 80,
    });
  });

  it("resizes widgets on the editor grid", () => {
    expect(
      resizeWidgetLayout(baseLayout, { dx: 21, dy: 18 }, { width: 500, height: 400 }, { width: 80, height: 48 }),
    ).toEqual({
      ...baseLayout,
      width: 144,
      height: 96,
    });
  });

  it("keeps resized widgets within min size and canvas bounds", () => {
    expect(
      resizeWidgetLayout(baseLayout, { dx: -400, dy: 500 }, { width: 180, height: 140 }, { width: 80, height: 48 }),
    ).toEqual({
      ...baseLayout,
      width: 80,
      height: 108,
    });
  });

  it("parses 2d transform scale values", () => {
    expect(parseScaleFromTransform("matrix(0.5, 0, 0, 0.5, 0, 0)")).toBe(0.5);
  });

  it("parses 3d transform scale values", () => {
    expect(parseScaleFromTransform("matrix3d(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1)")).toBe(2);
  });

  it("falls back to scale 1 for missing or unsupported transforms", () => {
    expect(parseScaleFromTransform("none")).toBe(1);
    expect(parseScaleFromTransform("rotate(20deg)")).toBe(1);
  });
});
