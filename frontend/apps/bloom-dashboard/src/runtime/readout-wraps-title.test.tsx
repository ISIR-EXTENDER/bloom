/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

// Vitest empties imported CSS, so the stylesheet is read from disk; the package has no Node types.
type NodeFs = { readFileSync: (path: string, encoding: "utf8") => string };
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;

/** The declarations of every rule whose selector list mentions the class, joined. */
function declarationsFor(css: string, selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((match) => match[1]?.includes(selector))
    .map((match) => match[2] ?? "")
    .join("\n");
}

describe("a slider's or gauge's readout", () => {
  it("keeps its width while the title wraps, so a number is never cut to an ellipsis", async () => {
    const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs;
    const css = fs.readFileSync(`${nodeProcess.cwd()}/src/runtime-widgets.css`, "utf8");
    for (const readout of [
      ".bloom-slider-widget > .bloom-widget-head > .bloom-widget-readout",
      ".bloom-gauge-widget > .bloom-display-header > span",
      ".bloom-confidence-bars > .bloom-display-header > span",
    ]) {
      expect(declarationsFor(css, readout)).toMatch(/flex:\s*0 0 auto/);
    }
    for (const title of [
      ".bloom-slider-widget > .bloom-widget-head > strong",
      ".bloom-gauge-widget > .bloom-display-header > strong",
    ]) {
      const rules = declarationsFor(css, title);
      expect(rules).toMatch(/white-space:\s*normal/);
      expect(rules).not.toMatch(/text-overflow:\s*ellipsis/);
    }
  });

  it("lets the confidence bars scroll past three goals instead of growing the card", async () => {
    const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs;
    const css = fs.readFileSync(`${nodeProcess.cwd()}/src/runtime-widgets.css`, "utf8");
    const rules = declarationsFor(css, ".bloom-confidence-list");
    expect(rules).toMatch(/overflow-y:\s*auto/);
    expect(rules).toMatch(/min-height:\s*0/);
  });
});
