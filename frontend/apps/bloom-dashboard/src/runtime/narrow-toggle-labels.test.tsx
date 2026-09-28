/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { renderScreenWidgets, resetCommandStateForTests } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import explorerManager from "../../../../../backend/seed/applications/explorer-manager.json";
import kinovaManager from "../../../../../backend/seed/applications/kinova-manager.json";
import sandbox from "../../../../../backend/seed/applications/sandbox.json";

// Vitest empties imported CSS, so the stylesheet is read from disk; the package has no Node types.
type NodeFs = { readFileSync: (path: string, encoding: "utf8") => string };
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;

function narrowToggles(): WidgetConfig[] {
  const found: WidgetConfig[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      const widget = node as Partial<WidgetConfig>;
      if (widget.kind === "toggle" && widget.layout && widget.layout.width <= 220 && !widget.settings?.variant) {
        found.push(widget as WidgetConfig);
      }
      Object.values(node).forEach(walk);
    }
  };
  walk([explorerManager, kinovaManager, sandbox]);
  return found;
}

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  document.head.innerHTML = "";
});

describe("the narrowest shipped toggle cards, state unknown", () => {
  const toggles = narrowToggles();

  it("include the Sandbox gripper at 200 px", () => {
    expect(toggles.map((toggle) => `${toggle.id} ${toggle.layout.width}`)).toContain("sandbox-gripper 200");
  });

  it.each(toggles.map((toggle) => [toggle.id, toggle] as const))(
    "%s wraps its two labels, never cuts them",
    async (_, toggle) => {
      const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs;
      const style = document.createElement("style");
      style.textContent = fs.readFileSync(`${nodeProcess.cwd()}/src/runtime-widgets.css`, "utf8");
      document.head.append(style);
      const screen = {
        id: "s",
        title: "S",
        canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
        widgets: [toggle],
      } as ScreenConfig;
      const descriptors = renderScreenDescriptors(screen, createDefaultWidgetRegistry());
      const { container } = render(<div>{renderScreenWidgets(descriptors, { onActionIntent: () => undefined })}</div>);

      const buttons = [...container.querySelectorAll<HTMLButtonElement>(".bloom-toggle-choices button")];
      expect(buttons.map((button) => button.textContent)).toEqual([toggle.settings.offLabel, toggle.settings.onLabel]);
      for (const button of buttons) {
        const computed = getComputedStyle(button);
        expect(computed.textOverflow).not.toBe("ellipsis");
        expect(computed.whiteSpace).not.toBe("nowrap");
        // jsdom does no layout, so this holds trivially there; the visual smoke measures it on glass.
        expect(button.scrollHeight).toBeLessThanOrEqual(button.clientHeight);
      }
    },
  );

  it("the stylesheet never cuts a two-sided toggle's label", async () => {
    const fs = (await import(/* @vite-ignore */ `node:${"fs"}`)) as NodeFs;
    const css = fs.readFileSync(`${nodeProcess.cwd()}/src/runtime-widgets.css`, "utf8");
    const rules = [...css.matchAll(/([^{}]*\.bloom-toggle-choices[^{}]*)\{([^}]*)\}/g)].map((match) => match[2]);
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) {
      expect(body).not.toMatch(/text-overflow|white-space:\s*nowrap/);
    }
  });
});
