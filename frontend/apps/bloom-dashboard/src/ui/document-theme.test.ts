/**
 * @vitest-environment jsdom
 */
import { BLOOM_DEFAULT_SHAPE, BLOOM_THEME_PRESETS } from "@bloom/ui";
import { describe, expect, it } from "vitest";

import { applyDocumentTheme } from "./document-theme";

describe("the palette painted on the page", () => {
  it("leaves no High visibility radius behind when Dark takes over", () => {
    const root = document.createElement("html");

    applyDocumentTheme(root, BLOOM_THEME_PRESETS["high-contrast"]);
    expect(root.style.getPropertyValue("--bloom-radius-card")).toBe("12px");

    applyDocumentTheme(root, BLOOM_THEME_PRESETS.dark);
    expect(root.style.getPropertyValue("--bloom-radius-card")).toBe(BLOOM_DEFAULT_SHAPE.radiusCard);
    expect(root.style.getPropertyValue("--bloom-stop")).toBe(BLOOM_THEME_PRESETS.dark.tokens.stop);
    expect(root.style.colorScheme).toBe("dark");
    expect(root.dataset.bloomTheme).toBe("dark");
  });

  it("removes a property the next palette does not set at all", () => {
    const root = document.createElement("html");
    applyDocumentTheme(root, BLOOM_THEME_PRESETS.bloom);
    // A palette that stopped emitting a key (a retired token) must not leave the old value on the page.
    const trimmed = { ...BLOOM_THEME_PRESETS.bloom, tokens: { ...BLOOM_THEME_PRESETS.bloom.tokens } };
    root.style.setProperty("--bloom-retired", "#000000");
    root.dataset.bloomThemeKeys = `${root.dataset.bloomThemeKeys} --bloom-retired`;

    applyDocumentTheme(root, trimmed);

    expect(root.style.getPropertyValue("--bloom-retired")).toBe("");
    expect(root.style.getPropertyValue("--bloom-primary")).toBe(BLOOM_THEME_PRESETS.bloom.tokens.primary);
  });
});
