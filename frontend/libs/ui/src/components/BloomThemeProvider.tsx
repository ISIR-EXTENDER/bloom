import type { ReactNode } from "react";

import { BLOOM_THEME_PRESETS, type BloomThemePreset, type BloomThemeTokens, createBloomThemeStyle } from "../theme";

export type BloomThemeProviderProps = {
  children: ReactNode;
  theme?: BloomThemePreset | BloomThemeTokens;
};

export function BloomThemeProvider({ children, theme = BLOOM_THEME_PRESETS.bloom }: BloomThemeProviderProps) {
  return (
    <div className="bloom-theme-root" style={createBloomThemeStyle(theme)}>
      {children}
    </div>
  );
}
