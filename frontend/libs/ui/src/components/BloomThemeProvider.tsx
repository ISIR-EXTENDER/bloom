import type { ReactNode } from "react";

import { BLOOM_THEME_PRESETS, type BloomThemePreset, type BloomThemeTokens, createBloomThemeStyle } from "../theme";

export type BloomThemeProviderProps = {
  /** A span lets a preview sit inside a button. */
  as?: "div" | "span";
  children: ReactNode;
  className?: string;
  theme?: BloomThemePreset | BloomThemeTokens;
};

/** data-bloom-theme names the palette, so canvas widgets can re-read their colours when it changes. */
export function BloomThemeProvider({
  as: Element = "div",
  children,
  className,
  theme = BLOOM_THEME_PRESETS.bloom,
}: BloomThemeProviderProps) {
  return (
    <Element
      className={className ? `bloom-theme-root ${className}` : "bloom-theme-root"}
      data-bloom-theme={"tokens" in theme ? theme.id : "custom"}
      style={createBloomThemeStyle(theme)}
    >
      {children}
    </Element>
  );
}
