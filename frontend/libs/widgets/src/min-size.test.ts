import { describe, expect, it } from "vitest";

import designSystemPage from "../../../../docs/design/design-system.html?raw";
import minSizeDoc from "../../../../docs/design/widget-min-size.md?raw";

import { DEFAULT_WIDGET_DEFINITIONS } from "./index";
import {
  findSizeShortfall,
  INTERACTIVE_WIDGET_KINDS,
  minSizeFor,
  PROFILE_TARGET_PX,
  type PrimaryTargetLayout,
  type PrimaryTargetSettings,
  primaryTargetFor,
  TOUCH_FLOOR_PX,
  WIDGET_MIN_SIZE,
} from "./min-size";
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
    expect(minSizeFor("joystick", { hide_title: true })).toEqual([280, 300]);
    expect(minSizeFor("gauge", { hide_title: true, show_details: true })).toEqual([320, 208]);
    expect(minSizeFor("camera", {})).toBeNull();
  });

  it.each(DEFAULT_WIDGET_DEFINITIONS.map((definition) => [definition.kind, definition] as const))(
    "adds a %s from the palette at or above its minimum",
    (kind, { defaultLayout, defaultSettings }) => {
      expect(findSizeShortfall({ kind, layout: defaultLayout, settings: defaultSettings })).toBeNull();
    },
  );

  it("reports the shortfall that shipped as the clipped gripper", () => {
    expect(
      findSizeShortfall({ kind: "toggle", layout: { width: 130, height: 130 }, settings: { show_details: true } }),
    ).toEqual({ minimum: [250, 144], width: 130, height: 130 });
    expect(findSizeShortfall({ kind: "toggle", layout: { width: 300, height: 120 }, settings: {} })).toBeNull();
  });
});

/** Each §04b row, as the settings that select that derivation. */
const TARGET_ROWS: Readonly<Record<string, { kind: string; settings: PrimaryTargetSettings }>> = {
  toggle: { kind: "toggle", settings: {} },
  "joystick · title above": { kind: "joystick", settings: { title_placement: "above" } },
  "joystick · title in the corner": { kind: "joystick", settings: { title_placement: "overlay" } },
  "joystick · with readouts": { kind: "joystick", settings: { show_details: true } },
  "gesture-pad": { kind: "gesture-pad", settings: {} },
  "slider · segments": { kind: "slider", settings: { variant: "segments" } },
  "slider · return to centre": { kind: "slider", settings: { returnToCenter: true } },
  "slider · continuous": { kind: "slider", settings: {} },
  "command-button": { kind: "command-button", settings: {} },
  "command-button · in a group": { kind: "command-button", settings: { hide_title: true } },
};

const TARGET_PROBES: PrimaryTargetLayout[] = [
  { height: 88, width: 264 },
  { height: 120, width: 338 },
  // The square that passed the floor at 56 and drew a 47 px knob.
  { height: 216, width: 216 },
  { height: 346, width: 314 },
  { height: 384, width: 384 },
];

/** The grammar §04b writes its targets in: a constant, `w`, `h`, `x - k`, `x * k`, `min`/`max`, `round(…)`. */
function evaluateTarget(formula: string, layout: PrimaryTargetLayout): number {
  const term = formula.trim();
  const rounded = term.match(/^round\((.+)\)$/);
  if (rounded?.[1]) return Math.round(evaluateTarget(rounded[1], layout));
  const scaled = term.match(/^(.+) \* ([\d.]+)$/);
  if (scaled?.[1]) return evaluateTarget(scaled[1], layout) * Number(scaled[2]);
  // Nesting only ever sits in the second argument, so the first comma is the split.
  const bound = term.match(/^(min|max)\((.+?), (.+)\)$/);
  if (bound?.[2] && bound[3]) {
    const pair = [evaluateTarget(bound[2], layout), evaluateTarget(bound[3], layout)] as const;
    return bound[1] === "max" ? Math.max(...pair) : Math.min(...pair);
  }
  const reduced = term.match(/^(.+) - (\d+)$/);
  if (reduced?.[1]) return evaluateTarget(reduced[1], layout) - Number(reduced[2]);
  if (term === "w") return layout.width;
  if (term === "h") return layout.height;
  return Number(term);
}

describe("the primary target contract", () => {
  const section = designSystemPage.split('id=\\"targets\\"')[1]?.split('id=\\"regions\\"')[0] ?? "";
  const documented = [
    ...section.matchAll(
      /font-weight: 700;[^>]*>([^<]+)<\\u002Fsc-raw-td>[^<]*<sc-raw-td[^>]*>([^<]+)<\\u002Fsc-raw-td>/g,
    ),
  ].map(([, kind, formula]) => [kind, formula] as const);

  it("covers every interactive kind and nothing else", () => {
    expect(documented.map(([kind]) => kind)).toEqual(Object.keys(TARGET_ROWS));
    expect([...new Set(Object.values(TARGET_ROWS).map((row) => row.kind))].sort()).toEqual(
      [...INTERACTIVE_WIDGET_KINDS].sort(),
    );
    expect(primaryTargetFor("label", {}, TARGET_PROBES[0] as PrimaryTargetLayout)).toBeNull();
  });

  it.each(documented)("computes the %s target the design system documents as %s", (kind, formula) => {
    const row = TARGET_ROWS[kind];
    if (!row) throw new Error(`Undocumented row ${kind}.`);
    for (const layout of TARGET_PROBES) {
      expect(primaryTargetFor(row.kind, row.settings, layout)).toBe(evaluateTarget(formula, layout));
    }
  });

  it("keeps a continuous limit on the 44 px floor at the tablet fit scale", () => {
    const limit = primaryTargetFor("slider", {}, { height: 120, width: 338 });
    expect(limit).toBe(56);
    expect(Math.floor((limit ?? 0) * 0.8)).toBe(44);
  });

  it("promises the hand one table, wherever the promise is read", () => {
    expect(PROFILE_TARGET_PX).toEqual({ compact: 40, comfort: 56, default: 48, "high-visibility": 64 });
    expect(Math.min(...Object.values(PROFILE_TARGET_PX))).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX - 4);
  });

  // A toggle is a fixed 56 and a command button caps there, so a role claiming more than 56 cannot be met by
  // those two kinds at any size. The sweep records it per app; this holds the ceiling itself.
  it("cannot meet a claim above the 56 px ceiling those two kinds share", () => {
    const roomy = { height: 400, width: 400 };
    expect(primaryTargetFor("toggle", {}, roomy)).toBe(56);
    expect(primaryTargetFor("command-button", {}, roomy)).toBe(56);
    expect(PROFILE_TARGET_PX["high-visibility"]).toBeGreaterThan(56);
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

describe("primaryTargetFor and the role's touch target", () => {
  it("grows a titled button and a toggle to the role's target when the card has room", () => {
    const roomy = { width: 200, height: 160 };
    expect(primaryTargetFor("toggle", {}, roomy, 64)).toBe(64);
    expect(primaryTargetFor("command-button", {}, roomy, 64)).toBe(64);
    // Compact roles never shrink the control under the 56 px the renderer keeps.
    expect(primaryTargetFor("toggle", {}, roomy, 40)).toBe(56);
  });

  it("is bounded by the card: the title row and padding come off first", () => {
    expect(primaryTargetFor("toggle", {}, { width: 200, height: 80 }, 64)).toBe(48);
    expect(primaryTargetFor("command-button", { hide_title: true }, { width: 140, height: 88 }, 64)).toBe(56);
  });
});
