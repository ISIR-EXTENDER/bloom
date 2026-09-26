import { describe, expect, it } from "vitest";

// Vitest empties imported CSS, so the stylesheet is read from disk; the package has no Node types.
type NodeFs = { readFileSync: (path: string, encoding: "utf8") => string };
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;

describe("momentary command buttons", () => {
  // With touch-action: manipulation, a trembling finger that drifts past the pan threshold fires
  // pointercancel and lets go of Snake while the finger is still down.
  it("take every touch gesture themselves", async () => {
    const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs;
    const css = fs.readFileSync(`${nodeProcess.cwd()}/src/runtime-widgets.css`, "utf8");
    const rule = css.match(/\.bloom-command-button\[data-momentary="true"\]\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/touch-action:\s*none/);
  });
});
