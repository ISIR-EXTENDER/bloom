import { type BloomThemePreset, createBloomThemeStyle } from "@bloom/ui";

const APPLIED_KEYS = "bloomThemeKeys";

/**
 * Paints a palette on the page itself, so the background behind the app, its scrollbars and anything
 * portalled to <body> follow. A key the new palette does not set is removed, never left from the last one.
 */
export function applyDocumentTheme(root: HTMLElement, theme: BloomThemePreset): void {
  const style = createBloomThemeStyle(theme) as Record<string, string>;
  const previous = new Set((root.dataset[APPLIED_KEYS] ?? "").split(" ").filter(Boolean));
  const applied: string[] = [];
  for (const [name, value] of Object.entries(style)) {
    if (name.startsWith("--")) {
      root.style.setProperty(name, value);
      applied.push(name);
      previous.delete(name);
    }
  }
  for (const stale of previous) {
    root.style.removeProperty(stale);
  }
  root.style.colorScheme = theme.scheme;
  root.dataset.bloomTheme = theme.id;
  root.dataset[APPLIED_KEYS] = applied.join(" ");
}
