import { describe, expect, it } from "vitest";

import minSizeDoc from "../../../../docs/design/widget-min-size.md?raw";

import { findSizeShortfall, minSizeFor, WIDGET_MIN_SIZE } from "./min-size";
import { BENCH_RAIL, padGeometry } from "./pad-geometry";

describe("the widget minimum-size contract", () => {
  it("is the constant documented in docs/design/widget-min-size.md", () => {
    const block = minSizeDoc.match(/```ts\nexport const WIDGET_MIN_SIZE = \{\n([\s\S]*?)\n\};/)?.[1];
    const documented = Object.fromEntries(
      [...(block ?? "").matchAll(/^\s*'?([\w:-]+)'?:\s*\{ off: \[(\d+),\s*(\d+)\], on: \[(\d+),\s*(\d+)\] \}/gm)].map(
        ([, key, offW, offH, onW, onH]) => [key, { off: [Number(offW), Number(offH)], on: [Number(onW), Number(onH)] }],
      ),
    );

    expect(documented).toEqual(WIDGET_MIN_SIZE);
  });

  it("picks the derivation the renderer will actually draw", () => {
    expect(minSizeFor("toggle", {})).toEqual([200, 120]);
    expect(minSizeFor("toggle", { show_details: true })).toEqual([250, 144]);
    expect(minSizeFor("toggle", { hide_title: true })).toEqual([200, 88]);
    expect(minSizeFor("toggle", { layout: "inline" })).toEqual([360, 88]);
    expect(minSizeFor("command-button", { hide_title: true, show_details: true })).toEqual([140, 88]);
    expect(minSizeFor("slider", { direction: "vertical" })).toEqual([104, 284]);
    expect(minSizeFor("slider", {})).toEqual([260, 104]);
    expect(minSizeFor("joystick", { hide_title: true })).toEqual([280, 332]);
    expect(minSizeFor("camera", {})).toBeNull();
  });

  it("reports the shortfall that shipped as the clipped gripper", () => {
    expect(
      findSizeShortfall({ kind: "toggle", layout: { width: 130, height: 130 }, settings: { show_details: true } }),
    ).toEqual({ minimum: [250, 144], width: 130, height: 130 });
    expect(findSizeShortfall({ kind: "toggle", layout: { width: 300, height: 120 }, settings: {} })).toBeNull();
  });
});

describe("the pad recipe", () => {
  it.each([
    [376, 208, 42, 98],
    [340, 172, 34, 88],
    [300, 132, 26, 78],
  ])("derives a %i px pad from its edge alone", (size, ring, deadzone, knob) => {
    expect(padGeometry(size)).toMatchObject({ block: 72, topInset: 52, gap: 12, ring, deadzone, knob });
  });

  it("keeps STOP in the bench rail", () => {
    expect(BENCH_RAIL.stop.x).toBe(BENCH_RAIL.rail.x);
    expect(BENCH_RAIL.stop.x + BENCH_RAIL.stop.width).toBe(BENCH_RAIL.rail.right);
  });
});
