import { BLOOM_THEME_PRESET_ORDER, BLOOM_THEME_PRESETS, createBloomThemeStyle } from "@bloom/ui";
import { describe, expect, it } from "vitest";

// Vitest empties imported CSS, so the stylesheets are read from disk; the package has no Node types.
type NodeFs = {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: "utf8") => string;
};
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;
const loadFs = async () => (await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs;
const SRC = `${nodeProcess.cwd()}/src`;
const UI_STYLES = `${nodeProcess.cwd()}/../../libs/ui/src/styles.css`;

async function readStylesheets(): Promise<{ css: string; name: string }[]> {
  const fs = await loadFs();
  const sheets = fs
    .readdirSync(SRC)
    .filter((name) => name.endsWith(".css"))
    .map((name) => ({ css: fs.readFileSync(`${SRC}/${name}`, "utf8"), name }));
  return [...sheets, { css: fs.readFileSync(UI_STYLES, "utf8"), name: "libs/ui/src/styles.css" }];
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Colour literals a palette cannot reach: hex, rgb/hsl functions and named colours in a value. */
function findColorLiterals(css: string): string[] {
  const literals: string[] = [];
  // Only a :root block may hold a literal: that is where the Bloom Garden defaults live. A token
  // redefined inside a component rule is a palette leak and is reported like any other literal.
  let inRoot = false;
  stripComments(css)
    .split("\n")
    .forEach((line, index) => {
      if (/^\s*:root\s*\{/.test(line)) {
        inRoot = true;
      }
      const value = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
      const found = value.match(
        /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![\w-])(?:white|black|red|green|blue|gray|grey)(?![\w-])/gi,
      );
      if (found && !inRoot) {
        literals.push(`${index + 1}: ${line.trim()}`);
      }
      if (inRoot && /^\s*\}/.test(line)) {
        inRoot = false;
      }
    });
  return literals;
}

describe("stylesheets follow the chosen palette", () => {
  it("carry no colour literal outside the token definitions", async () => {
    const offenders = (await readStylesheets()).flatMap(({ css, name }) =>
      findColorLiterals(css).map((line) => `${name}:${line}`),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("catches the literals it is meant to catch", () => {
    expect(findColorLiterals("a { color: #22c55e; }")).toHaveLength(1);
    expect(findColorLiterals("a { background: color-mix(in srgb, red 4%, white); }")).toHaveLength(1);
    expect(findColorLiterals("a { box-shadow: 0 1px rgba(0, 0, 0, 0.2); }")).toHaveLength(1);
    expect(findColorLiterals("a { white-space: nowrap; color: currentColor; background: transparent; }")).toEqual([]);
    expect(findColorLiterals("a { outline: 2px dashed var(--bloom-unavailable-outline); }")).toEqual([]);
    expect(
      findColorLiterals(":root {\n  --bloom-color-ink: #253d35;\n}\n.card {\n  --bloom-ink: #000;\n}"),
    ).toHaveLength(1);
  });

  it("read only tokens that a palette, a stylesheet or a component defines", async () => {
    const fs = await loadFs();
    const sheets = await readStylesheets();
    const all = [...sheets.map((sheet) => sheet.css), fs.readFileSync(UI_STYLES, "utf8")].join("\n");
    const used = new Set([...all.matchAll(/var\((--bloom-[a-z0-9-]+)\s*\)/g)].map((match) => match[1]));
    const defined = new Set([
      ...[...all.matchAll(/(--bloom-[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
      ...Object.keys(createBloomThemeStyle(BLOOM_THEME_PRESETS.bloom)),
    ]);
    // Components set layout values inline: a gauge's percent, a pad's inset, a dwell ring's progress.
    const inline = [
      "--bloom-dwell-progress",
      "--bloom-gauge-percent",
      "--bloom-gesture-angle",
      "--bloom-gesture-power",
      "--bloom-joystick-deadzone",
      "--bloom-pad-inset",
      "--bloom-pad-label-width",
      "--bloom-pad-line-height",
      "--bloom-pad-top-inset",
      "--bloom-proximity",
      "--bloom-proximity-color",
      "--bloom-series-color",
      "--bloom-share",
      "--bloom-widget-height",
    ];
    const missing = [...used].filter((name) => name && !defined.has(name) && !inline.includes(name));
    expect(missing).toEqual([]);
  });

  it("give every palette the same set of CSS properties, so switching never leaves a stale value", () => {
    const keys = (id: (typeof BLOOM_THEME_PRESET_ORDER)[number]) =>
      Object.keys(createBloomThemeStyle(BLOOM_THEME_PRESETS[id])).sort();
    for (const id of BLOOM_THEME_PRESET_ORDER) {
      expect(keys(id), id).toEqual(keys("bloom"));
    }
  });
});

describe("the states a palette must keep apart", () => {
  const rule = (css: string, selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return stripComments(css).match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  };
  const sheet = async (name: string) => (await loadFs()).readFileSync(`${SRC}/${name}`, "utf8");

  it("draws unavailable as a 2px dashed outline in its own token, apart from a solid unknown", async () => {
    const widgets = await sheet("runtime-widgets.css");
    expect(rule(widgets, '.widget-preview-card[data-runtime-unavailable="true"]')).toMatch(
      /outline:\s*2px dashed var\(--bloom-unavailable-outline\)/,
    );
  });

  it("fills STOP from the stop tokens, latched from its own pair, and rings its focus inside", async () => {
    const app = await sheet("runtime-app.css");
    const stop = rule(app, ".runtime-stop-control");
    expect(stop).toMatch(/background:\s*var\(--bloom-stop\)/);
    expect(stop).toMatch(/color:\s*var\(--bloom-on-stop\)/);
    expect(rule(app, '.runtime-stop-control[data-stopped="true"]')).toMatch(
      /background:\s*var\(--bloom-stop-latched\)/,
    );
    expect(rule(app, ".runtime-stop-control:focus-visible")).toMatch(/outline:\s*3px solid var\(--bloom-focus-ring\)/);
    expect(rule(app, "[data-scan-lit]")).toMatch(/outline:\s*4px solid var\(--bloom-primary\)/);
  });

  it("marks ready with the success colour and keeps the round dot, so colour is never the only cue", async () => {
    const app = await sheet("runtime-app.css");
    expect(rule(app, '.runtime-status-pill[data-status="ready"] .runtime-status-pill-value')).toMatch(
      /color:\s*var\(--bloom-success\)/,
    );
    expect(rule(app, '.runtime-kiosk-status[data-tone="ready"] .runtime-kiosk-status-dot')).toMatch(
      /border-radius:\s*50%/,
    );
  });
});
