import type { CSSProperties } from "react";

export type BloomPaletteTokenName =
  | "accent"
  | "accentHover"
  | "accentSoft"
  | "border"
  | "cream"
  | "forest"
  | "ink"
  | "inkSoft"
  | "lilac"
  | "mist"
  | "muted"
  | "paper"
  | "petal"
  | "pollen"
  | "sage"
  | "surfaceSoft";

export type BloomSemanticColorTokenName =
  | "error"
  | "errorContainer"
  | "onError"
  | "onErrorContainer"
  | "onPrimary"
  | "onPrimaryContainer"
  | "onSecondary"
  | "onSecondaryContainer"
  | "onSurface"
  | "onSurfaceMuted"
  | "outline"
  | "primary"
  | "primaryContainer"
  | "secondary"
  | "secondaryContainer"
  | "surface"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "surfaceContainerLow";

export type BloomThemeTokenName = BloomPaletteTokenName | BloomSemanticColorTokenName;

export type BloomPaletteTokens = Readonly<Record<BloomPaletteTokenName, string>>;

export type BloomSemanticColorTokens = Readonly<Record<BloomSemanticColorTokenName, string>>;

export type BloomThemeTokens = BloomPaletteTokens & BloomSemanticColorTokens;

export type BloomThemePresetId = "bloom" | "clinical" | "petanque-play";

export type BloomThemePreset = {
  description: string;
  id: BloomThemePresetId;
  name: string;
  tokens: BloomThemeTokens;
};

type BloomThemePresetInput = {
  description: string;
  id: BloomThemePresetId;
  name: string;
  palette: BloomPaletteTokens;
  roles?: Partial<BloomSemanticColorTokens>;
};

function createThemePreset({ description, id, name, palette, roles = {} }: BloomThemePresetInput): BloomThemePreset {
  return {
    description,
    id,
    name,
    tokens: {
      ...palette,
      error: roles.error ?? palette.accent,
      errorContainer: roles.errorContainer ?? palette.accentSoft,
      onError: roles.onError ?? palette.paper,
      onErrorContainer: roles.onErrorContainer ?? palette.ink,
      onPrimary: roles.onPrimary ?? palette.paper,
      onPrimaryContainer: roles.onPrimaryContainer ?? palette.ink,
      onSecondary: roles.onSecondary ?? palette.paper,
      onSecondaryContainer: roles.onSecondaryContainer ?? palette.ink,
      onSurface: roles.onSurface ?? palette.ink,
      onSurfaceMuted: roles.onSurfaceMuted ?? palette.inkSoft,
      outline: roles.outline ?? palette.border,
      primary: roles.primary ?? palette.forest,
      primaryContainer: roles.primaryContainer ?? palette.mist,
      secondary: roles.secondary ?? palette.accent,
      secondaryContainer: roles.secondaryContainer ?? palette.accentSoft,
      surface: roles.surface ?? palette.paper,
      surfaceContainer: roles.surfaceContainer ?? palette.cream,
      surfaceContainerHigh: roles.surfaceContainerHigh ?? palette.surfaceSoft,
      surfaceContainerLow: roles.surfaceContainerLow ?? palette.paper,
    },
  };
}

export const BLOOM_THEME_PRESETS: Readonly<Record<BloomThemePresetId, BloomThemePreset>> = {
  bloom: createThemePreset({
    id: "bloom",
    name: "Bloom Garden",
    description: "Soft garden-inspired default theme from the Bloom mood board.",
    palette: {
      accent: "#839a82",
      accentHover: "#6f886f",
      accentSoft: "#e7ede2",
      border: "rgba(49, 73, 63, 0.16)",
      cream: "#f2eadc",
      forest: "#31493f",
      ink: "#253d35",
      inkSoft: "#536960",
      lilac: "#c7bddc",
      mist: "#c8d5c4",
      muted: "#74847b",
      paper: "#fffaf1",
      petal: "#eebbbb",
      pollen: "#ffd89b",
      sage: "#7e967e",
      surfaceSoft: "#f8f4eb",
    },
    roles: {
      error: "#9b3d2e",
      errorContainer: "#f5ddd8",
      onError: "#fffaf1",
      onErrorContainer: "#4f1f16",
    },
  }),
  clinical: createThemePreset({
    id: "clinical",
    name: "Clinical Calm",
    description: "Very neutral high-readability theme for bright lab and tablet conditions.",
    palette: {
      accent: "#6f8c7a",
      accentHover: "#587463",
      accentSoft: "#e9eee9",
      border: "rgba(42, 58, 52, 0.15)",
      cream: "#eee8dc",
      forest: "#2d423b",
      ink: "#233530",
      inkSoft: "#52615c",
      lilac: "#d6d2df",
      mist: "#d4ddd2",
      muted: "#707d78",
      paper: "#fffdf8",
      petal: "#ead1cf",
      pollen: "#f1d7a8",
      sage: "#879989",
      surfaceSoft: "#f4f1ea",
    },
    roles: {
      error: "#a33b2f",
      errorContainer: "#f1dedb",
      primary: "#2d423b",
      primaryContainer: "#d4ddd2",
    },
  }),
  "petanque-play": createThemePreset({
    id: "petanque-play",
    name: "Petanque Play",
    description: "Warmer, more playful app theme for demos and expressive interfaces.",
    palette: {
      accent: "#f1a340",
      accentHover: "#ce7f1e",
      accentSoft: "#fff0d2",
      border: "rgba(86, 59, 34, 0.18)",
      cream: "#f5dfbd",
      forest: "#345444",
      ink: "#2f3428",
      inkSoft: "#6c5f4a",
      lilac: "#c8b7e8",
      mist: "#b6d7a8",
      muted: "#84735b",
      paper: "#fff8ea",
      petal: "#f2a7a7",
      pollen: "#ffd166",
      sage: "#77a66e",
      surfaceSoft: "#fff3da",
    },
    roles: {
      error: "#b6412b",
      errorContainer: "#ffe1d6",
      onSecondary: "#2f3428",
      primary: "#345444",
      primaryContainer: "#b6d7a8",
      secondary: "#f1a340",
      secondaryContainer: "#fff0d2",
    },
  }),
};

export function createBloomThemeStyle(theme: BloomThemePreset | BloomThemeTokens): CSSProperties {
  const tokens = "tokens" in theme ? theme.tokens : theme;
  return {
    "--bloom-color-accent": tokens.accent,
    "--bloom-color-accent-hover": tokens.accentHover,
    "--bloom-color-accent-soft": tokens.accentSoft,
    "--bloom-color-border": tokens.border,
    "--bloom-color-cream": tokens.cream,
    "--bloom-color-error": tokens.error,
    "--bloom-color-error-container": tokens.errorContainer,
    "--bloom-color-forest": tokens.forest,
    "--bloom-color-ink": tokens.ink,
    "--bloom-color-ink-soft": tokens.inkSoft,
    "--bloom-color-lilac": tokens.lilac,
    "--bloom-color-mist": tokens.mist,
    "--bloom-color-muted": tokens.muted,
    "--bloom-color-on-error": tokens.onError,
    "--bloom-color-on-error-container": tokens.onErrorContainer,
    "--bloom-color-on-primary": tokens.onPrimary,
    "--bloom-color-on-primary-container": tokens.onPrimaryContainer,
    "--bloom-color-on-secondary": tokens.onSecondary,
    "--bloom-color-on-secondary-container": tokens.onSecondaryContainer,
    "--bloom-color-on-surface": tokens.onSurface,
    "--bloom-color-on-surface-muted": tokens.onSurfaceMuted,
    "--bloom-color-outline": tokens.outline,
    "--bloom-color-paper": tokens.paper,
    "--bloom-color-petal": tokens.petal,
    "--bloom-color-pollen": tokens.pollen,
    "--bloom-color-primary": tokens.primary,
    "--bloom-color-primary-container": tokens.primaryContainer,
    "--bloom-color-sage": tokens.sage,
    "--bloom-color-secondary": tokens.secondary,
    "--bloom-color-secondary-container": tokens.secondaryContainer,
    "--bloom-color-surface": tokens.surface,
    "--bloom-color-surface-container": tokens.surfaceContainer,
    "--bloom-color-surface-container-high": tokens.surfaceContainerHigh,
    "--bloom-color-surface-container-low": tokens.surfaceContainerLow,
    "--bloom-color-surface-soft": tokens.surfaceSoft,
    "--bloom-error": tokens.error,
    "--bloom-error-container": tokens.errorContainer,
    "--bloom-ink": tokens.onSurface,
    "--bloom-ink-soft": tokens.onSurfaceMuted,
    "--bloom-on-error": tokens.onError,
    "--bloom-on-error-container": tokens.onErrorContainer,
    "--bloom-on-primary": tokens.onPrimary,
    "--bloom-on-primary-container": tokens.onPrimaryContainer,
    "--bloom-on-secondary": tokens.onSecondary,
    "--bloom-on-secondary-container": tokens.onSecondaryContainer,
    "--bloom-on-surface": tokens.onSurface,
    "--bloom-on-surface-muted": tokens.onSurfaceMuted,
    "--bloom-outline": tokens.outline,
    "--bloom-primary": tokens.primary,
    "--bloom-primary-container": tokens.primaryContainer,
    "--bloom-secondary": tokens.secondary,
    "--bloom-secondary-container": tokens.secondaryContainer,
    "--bloom-surface": tokens.surface,
    "--bloom-surface-container": tokens.surfaceContainer,
    "--bloom-surface-container-high": tokens.surfaceContainerHigh,
    "--bloom-surface-container-low": tokens.surfaceContainerLow,
  } as CSSProperties;
}
