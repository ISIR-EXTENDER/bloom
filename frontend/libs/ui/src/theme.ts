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

export type BloomSeriesTokenName =
  | "series1"
  | "series2"
  | "series3"
  | "series4"
  | "series5"
  | "series6"
  | "series7"
  | "series8";

export type BloomSemanticColorTokenName =
  | BloomSeriesTokenName
  | "command"
  | "error"
  | "errorContainer"
  | "focusRing"
  | "focusRingContrast"
  | "hairline"
  | "hairlineStrong"
  | "onError"
  | "onErrorContainer"
  | "onPrimary"
  | "onPrimaryContainer"
  | "onSecondary"
  | "onSecondaryContainer"
  | "onStop"
  | "onStopLatched"
  | "onSuccess"
  | "onSurface"
  | "onSurfaceMuted"
  | "outline"
  | "primary"
  | "primaryContainer"
  | "secondary"
  | "secondaryContainer"
  | "shadow"
  | "stop"
  | "stopLatched"
  | "success"
  | "surface"
  | "surfaceBright"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "surfaceContainerLow"
  | "unavailableOutline";

export type BloomThemeTokenName = BloomPaletteTokenName | BloomSemanticColorTokenName;

export type BloomPaletteTokens = Readonly<Record<BloomPaletteTokenName, string>>;

export type BloomSemanticColorTokens = Readonly<Record<BloomSemanticColorTokenName, string>>;

export type BloomThemeTokens = BloomPaletteTokens & BloomSemanticColorTokens;

export type BloomThemePresetId = "bloom" | "colour-safe" | "dark" | "extender-ui" | "high-contrast" | "pastel";

/** Corner radii a preset may tighten; sizes and touch targets stay with the design contracts. */
export type BloomThemeShape = Readonly<Record<"radiusCard" | "radiusControl" | "radiusPad" | "radiusPanel", string>>;

/** The geometry in libs/ui/src/styles.css; every preset emits all four, so switching leaves no radius behind. */
export const BLOOM_DEFAULT_SHAPE: BloomThemeShape = {
  radiusCard: "18px",
  radiusControl: "14px",
  radiusPad: "22px",
  radiusPanel: "26px",
};

export type BloomThemePreset = {
  description: string;
  id: BloomThemePresetId;
  name: string;
  scheme: "dark" | "light";
  shape: BloomThemeShape;
  tokens: BloomThemeTokens;
};

type BloomThemeRoleInput = Partial<BloomSemanticColorTokens> &
  Pick<BloomSemanticColorTokens, "hairline" | "hairlineStrong" | "success" | "unavailableOutline">;

type BloomThemePresetInput = {
  description: string;
  id: BloomThemePresetId;
  name: string;
  palette: BloomPaletteTokens;
  roles: BloomThemeRoleInput;
  scheme?: "dark" | "light";
  series?: readonly string[];
  shape?: Partial<BloomThemeShape>;
};

/** The categorical plot ramp, in assignment order; past eight the ramp repeats with a dashed stroke. */
export const BLOOM_SERIES_RAMP = [
  "#31493f",
  "#7e967e",
  "#c98a7e",
  "#536960",
  "#8a7f5c",
  "#6b7f8a",
  "#8a6b7f",
  "#5c7d6b",
] as const;

function createThemePreset({
  description,
  id,
  name,
  palette,
  roles,
  scheme = "light",
  series = BLOOM_SERIES_RAMP,
  shape = {},
}: BloomThemePresetInput): BloomThemePreset {
  const error = roles.error ?? palette.accent;
  const onError = roles.onError ?? palette.paper;
  const primary = roles.primary ?? palette.forest;
  const seriesTokens = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [`series${index + 1}`, series[index] ?? BLOOM_SERIES_RAMP[index]]),
  ) as Record<BloomSeriesTokenName, string>;
  return {
    description,
    id,
    name,
    scheme,
    shape: { ...BLOOM_DEFAULT_SHAPE, ...shape },
    tokens: {
      ...palette,
      ...seriesTokens,
      command: roles.command ?? primary,
      error,
      errorContainer: roles.errorContainer ?? palette.accentSoft,
      focusRing: roles.focusRing ?? palette.ink,
      focusRingContrast: roles.focusRingContrast ?? palette.paper,
      hairline: roles.hairline,
      hairlineStrong: roles.hairlineStrong,
      onError,
      onErrorContainer: roles.onErrorContainer ?? palette.ink,
      onPrimary: roles.onPrimary ?? palette.paper,
      onPrimaryContainer: roles.onPrimaryContainer ?? palette.ink,
      onSecondary: roles.onSecondary ?? palette.ink,
      onSecondaryContainer: roles.onSecondaryContainer ?? palette.ink,
      onStop: roles.onStop ?? onError,
      onStopLatched: roles.onStopLatched ?? palette.paper,
      onSuccess: roles.onSuccess ?? palette.paper,
      onSurface: roles.onSurface ?? palette.ink,
      onSurfaceMuted: roles.onSurfaceMuted ?? palette.inkSoft,
      outline: roles.outline ?? palette.border,
      primary,
      primaryContainer: roles.primaryContainer ?? palette.mist,
      secondary: roles.secondary ?? palette.accent,
      secondaryContainer: roles.secondaryContainer ?? palette.accentSoft,
      shadow: roles.shadow ?? palette.ink,
      stop: roles.stop ?? error,
      stopLatched: roles.stopLatched ?? palette.ink,
      success: roles.success,
      surface: roles.surface ?? palette.paper,
      surfaceBright: roles.surfaceBright ?? "#ffffff",
      surfaceContainer: roles.surfaceContainer ?? palette.cream,
      surfaceContainerHigh: roles.surfaceContainerHigh ?? palette.surfaceSoft,
      surfaceContainerLow: roles.surfaceContainerLow ?? palette.paper,
      unavailableOutline: roles.unavailableOutline,
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
      muted: "#5c6b63",
      paper: "#fffaf1",
      petal: "#eebbbb",
      pollen: "#ffd89b",
      sage: "#7e967e",
      surfaceSoft: "#f8f4eb",
    },
    roles: {
      command: "#3b6fd1",
      error: "#7c2436",
      errorContainer: "#f5ddd8",
      hairline: "rgba(49, 73, 63, 0.18)",
      hairlineStrong: "rgba(49, 73, 63, 0.28)",
      onSecondary: "#0d1f19",
      onError: "#fffaf1",
      onErrorContainer: "#4f1f16",
      shadow: "#253d35",
      stop: "#a8392a",
      success: "#135c4f",
      unavailableOutline: "#6f7f76",
    },
  }),
  "extender-ui": createThemePreset({
    id: "extender-ui",
    name: "Extender",
    description: "Blue operator palette aligned with the current Extender UI tablet interface.",
    palette: {
      accent: "#1d4ed8",
      accentHover: "#1e40af",
      accentSoft: "#dbeafe",
      border: "#e2e8f0",
      cream: "#f1f5f9",
      forest: "#1e3a5f",
      ink: "#0f172a",
      inkSoft: "#475569",
      lilac: "#cbd5e1",
      mist: "#dbeafe",
      muted: "#5d6d83",
      paper: "#f8fafc",
      petal: "#fecdd3",
      pollen: "#fde68a",
      // Sage names live motion; a blue here puts the first review's pure blue back on a knob.
      sage: "#7e967e",
      surfaceSoft: "#ffffff",
    },
    roles: {
      command: "#0ea5e9",
      error: "#991b1b",
      errorContainer: "#fee2e2",
      hairline: "#cbd5e1",
      hairlineStrong: "#94a3b8",
      onError: "#ffffff",
      onErrorContainer: "#7f1d1d",
      onPrimary: "#f8fafc",
      onPrimaryContainer: "#0f172a",
      onSecondary: "#0b1220",
      primary: "#1d4ed8",
      primaryContainer: "#dbeafe",
      secondary: "#0ea5e9",
      secondaryContainer: "#e0f2fe",
      shadow: "#0f172a",
      stop: "#dc2626",
      success: "#134e4a",
      surface: "#f8fafc",
      surfaceContainer: "#f1f5f9",
      surfaceContainerHigh: "#ffffff",
      surfaceContainerLow: "#ffffff",
      unavailableOutline: "#64748b",
    },
    series: ["#1d4ed8", "#0e7490", "#7c3aed", "#475569", "#b45309", "#0f766e", "#be185d", "#4d7c0f"],
  }),
  "high-contrast": createThemePreset({
    id: "high-contrast",
    name: "High visibility",
    description: "Black on white with strong outlines, for low vision and glare.",
    palette: {
      accent: "#0033cc",
      accentHover: "#002299",
      accentSoft: "#e6ecff",
      border: "#000000",
      cream: "#f2f2f2",
      forest: "#000000",
      ink: "#000000",
      inkSoft: "#1a1a1a",
      lilac: "#d9d9d9",
      mist: "#e6ecff",
      muted: "#333333",
      paper: "#ffffff",
      petal: "#ffd6d6",
      pollen: "#ffcc00",
      sage: "#006b2e",
      surfaceSoft: "#ffffff",
    },
    roles: {
      command: "#0033cc",
      error: "#7a0000",
      errorContainer: "#ffe0e0",
      hairline: "#595959",
      hairlineStrong: "#000000",
      onError: "#ffffff",
      onErrorContainer: "#5c0000",
      onPrimary: "#ffffff",
      onSecondary: "#000000",
      primary: "#0033cc",
      primaryContainer: "#e6ecff",
      secondary: "#ffcc00",
      secondaryContainer: "#fff5cc",
      shadow: "#000000",
      stop: "#b00000",
      success: "#003f44",
      unavailableOutline: "#000000",
    },
    series: ["#000000", "#0033cc", "#5b2a86", "#005a26", "#7a4a00", "#006b75", "#595959", "#8a0f5c"],
    shape: { radiusCard: "12px", radiusControl: "10px", radiusPad: "14px", radiusPanel: "16px" },
  }),
  dark: createThemePreset({
    id: "dark",
    name: "Dark",
    description: "Light text on dark surfaces for dim rooms and night shifts; STOP stays a filled red.",
    scheme: "dark",
    palette: {
      accent: "#7fae88",
      accentHover: "#95c29d",
      accentSoft: "#26372c",
      border: "#3d4843",
      cream: "#1a201d",
      forest: "#a8d5b4",
      ink: "#eef3ee",
      inkSoft: "#bfcbc3",
      lilac: "#4d4466",
      mist: "#2b4636",
      muted: "#adbab1",
      paper: "#121715",
      petal: "#6b3a3a",
      pollen: "#6e5b26",
      sage: "#7fae88",
      surfaceSoft: "#1f2623",
    },
    roles: {
      command: "#7ab0ff",
      error: "#ffb4a8",
      errorContainer: "#5c1f16",
      focusRing: "#ffffff",
      focusRingContrast: "#000000",
      hairline: "#38423d",
      hairlineStrong: "#56625c",
      onError: "#410b04",
      onErrorContainer: "#ffdad4",
      onPrimary: "#0d1a12",
      onPrimaryContainer: "#dcefe1",
      onSecondary: "#1c1604",
      onSecondaryContainer: "#f6ebcb",
      onStop: "#ffffff",
      onStopLatched: "#121715",
      onSuccess: "#0b2414",
      primary: "#a8d5b4",
      primaryContainer: "#2b4636",
      secondary: "#e3c46c",
      secondaryContainer: "#453a18",
      shadow: "#000000",
      stop: "#dc2626",
      stopLatched: "#eef3ee",
      success: "#86d9a0",
      surface: "#121715",
      surfaceBright: "#3b4540",
      surfaceContainer: "#1a201d",
      surfaceContainerHigh: "#1f2623",
      surfaceContainerLow: "#161b19",
      unavailableOutline: "#9aa8a0",
    },
    series: ["#a8d5b4", "#7fae88", "#8fb8d0", "#bfcbc3", "#d9c98a", "#c9a3c0", "#e8a598", "#86c7a4"],
  }),
  "colour-safe": createThemePreset({
    id: "colour-safe",
    name: "Colour-blind safe",
    description: "Okabe-Ito colours that never lean on red against green; blue for action, vermilion for STOP.",
    palette: {
      accent: "#56b4e9",
      accentHover: "#3a9bd4",
      accentSoft: "#e3f2fb",
      border: "#c9c9c4",
      cream: "#f2f2ef",
      forest: "#004f7a",
      ink: "#1a1a1a",
      inkSoft: "#3d3d3d",
      lilac: "#e7d3e0",
      mist: "#d6ebf7",
      muted: "#555555",
      paper: "#fcfcfa",
      petal: "#f6d6c6",
      pollen: "#f6e3b0",
      sage: "#4c9a5a",
      surfaceSoft: "#ffffff",
    },
    roles: {
      command: "#0072b2",
      error: "#7d2b10",
      errorContainer: "#fbe3d6",
      hairline: "#d4d4cf",
      hairlineStrong: "#a3a39d",
      onError: "#ffffff",
      onErrorContainer: "#4a1600",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#00304d",
      onSecondary: "#1a1a1a",
      onSecondaryContainer: "#00304d",
      onStop: "#ffffff",
      onSuccess: "#ffffff",
      primary: "#0072b2",
      primaryContainer: "#d6ebf7",
      secondary: "#56b4e9",
      secondaryContainer: "#e3f2fb",
      shadow: "#1a1a1a",
      stop: "#b8420a",
      success: "#005e47",
      unavailableOutline: "#6b6b6b",
    },
    series: ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#1a1a1a", "#9e8c00"],
  }),
  pastel: createThemePreset({
    id: "pastel",
    name: "Pastel",
    description: "Soft pinks, lilac and mint on cream, with plum text; STOP stays a hot coral red.",
    palette: {
      accent: "#c8a4e8",
      accentHover: "#b48ddc",
      accentSoft: "#efe3fa",
      border: "rgba(61, 31, 58, 0.16)",
      cream: "#fbeef3",
      forest: "#5a3078",
      ink: "#3d1f3a",
      inkSoft: "#5f3f5b",
      lilac: "#d9c6ee",
      mist: "#d3efe6",
      muted: "#6a4a66",
      paper: "#fff7fa",
      petal: "#f9c5d8",
      pollen: "#ffe1b3",
      sage: "#8fcba0",
      surfaceSoft: "#fdf1f6",
    },
    roles: {
      command: "#5b7fe6",
      error: "#a02a50",
      errorContainer: "#fbdbe5",
      hairline: "rgba(61, 31, 58, 0.18)",
      hairlineStrong: "rgba(61, 31, 58, 0.3)",
      onError: "#ffffff",
      onErrorContainer: "#5a1030",
      onPrimary: "#ffffff",
      onPrimaryContainer: "#3d1f3a",
      onSecondary: "#3d1f3a",
      onSecondaryContainer: "#3d1f3a",
      onStop: "#ffffff",
      onStopLatched: "#fff7fa",
      onSuccess: "#ffffff",
      primary: "#9a4fbf",
      primaryContainer: "#ead9f7",
      secondary: "#c8a4e8",
      secondaryContainer: "#efe3fa",
      shadow: "#3d1f3a",
      stop: "#c93a2b",
      stopLatched: "#3d1f3a",
      success: "#134e4a",
      surface: "#fff7fa",
      surfaceContainer: "#fbeef3",
      surfaceContainerHigh: "#fdf1f6",
      surfaceContainerLow: "#fffbfd",
      unavailableOutline: "#8a6a86",
    },
    series: ["#7b3fa8", "#1a6b5c", "#3f6fd1", "#5f3f5b", "#a06a00", "#0e7490", "#8c5a2b", "#6b8e23"],
  }),
};

/** The order palettes are offered in, Builder and runtime alike. */
export const BLOOM_THEME_PRESET_ORDER: readonly BloomThemePresetId[] = [
  "bloom",
  "extender-ui",
  "high-contrast",
  "dark",
  "colour-safe",
  "pastel",
];

/** Ids stored by earlier versions; each maps to the vetted palette that replaced it. */
export const BLOOM_THEME_PRESET_ALIASES: Readonly<Record<string, BloomThemePresetId>> = {
  "bloom-default": "bloom",
  clinical: "bloom",
  extender: "extender-ui",
  "high-visibility": "high-contrast",
  "petanque-play": "bloom",
};

export function isBloomThemePresetId(value: unknown): value is BloomThemePresetId {
  return typeof value === "string" && Object.hasOwn(BLOOM_THEME_PRESETS, value);
}

/** A stored id as a vetted palette id; unknown and empty ids read as Bloom Garden. */
export function normalizeBloomThemePresetId(value: unknown): BloomThemePresetId {
  if (isBloomThemePresetId(value)) {
    return value;
  }
  return typeof value === "string" ? (BLOOM_THEME_PRESET_ALIASES[value] ?? "bloom") : "bloom";
}

export function resolveBloomThemePreset(value: unknown): BloomThemePreset {
  return BLOOM_THEME_PRESETS[normalizeBloomThemePresetId(value)];
}

/** An app's stored id with retired aliases replaced; an unknown (newer) id is kept and resolved at render. */
export function canonicalBloomThemePresetId(value: string): string {
  return BLOOM_THEME_PRESET_ALIASES[value] ?? value;
}

/** A role's stored palette: "" (and the old "bloom-default", or anything unknown) follows the app. */
export function normalizeRoleThemePresetId(value: unknown): BloomThemePresetId | "" {
  if (typeof value !== "string" || !value || value === "bloom-default") {
    return "";
  }
  const canonical = canonicalBloomThemePresetId(value);
  return isBloomThemePresetId(canonical) ? canonical : "";
}

/** The four-colour summary an app stores next to its preset id, for readers that predate the catalog. */
export function createBloomAppPalette(preset: BloomThemePreset) {
  return {
    accent: preset.tokens.secondary,
    background: preset.tokens.surfaceContainer,
    primary: preset.tokens.primary,
    surface: preset.tokens.surface,
  };
}

const SHAPE_PROPERTIES: Record<keyof BloomThemeShape, string> = {
  radiusCard: "--bloom-radius-card",
  radiusControl: "--bloom-radius-control",
  radiusPad: "--bloom-radius-pad",
  radiusPanel: "--bloom-radius-panel",
};

const translucent = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

export function createBloomThemeStyle(theme: BloomThemePreset | BloomThemeTokens): CSSProperties {
  const preset = "tokens" in theme ? theme : null;
  const tokens = preset ? preset.tokens : (theme as BloomThemeTokens);
  const shape = Object.fromEntries(
    Object.entries(preset?.shape ?? BLOOM_DEFAULT_SHAPE).map(([key, value]) => [
      SHAPE_PROPERTIES[key as keyof BloomThemeShape],
      value,
    ]),
  );
  const series = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `--bloom-series-${index + 1}`,
      tokens[`series${index + 1}` as BloomSeriesTokenName],
    ]),
  );
  return {
    colorScheme: preset?.scheme ?? "light",
    "--bloom-color-accent": tokens.accent,
    "--bloom-color-accent-hover": tokens.accentHover,
    "--bloom-color-accent-soft": tokens.accentSoft,
    "--bloom-color-border": tokens.border,
    "--bloom-color-cloud": tokens.surfaceSoft,
    "--bloom-color-command": tokens.command,
    "--bloom-color-cream": tokens.cream,
    "--bloom-color-error": tokens.error,
    "--bloom-color-error-container": tokens.errorContainer,
    "--bloom-color-focus-ring": tokens.focusRing,
    "--bloom-color-focus-ring-contrast": tokens.focusRingContrast,
    "--bloom-color-forest": tokens.forest,
    "--bloom-color-hairline": tokens.hairline,
    "--bloom-color-hairline-strong": tokens.hairlineStrong,
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
    "--bloom-color-on-stop": tokens.onStop,
    "--bloom-color-on-stop-latched": tokens.onStopLatched,
    "--bloom-color-on-success": tokens.onSuccess,
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
    "--bloom-color-shadow": tokens.shadow,
    "--bloom-color-stop": tokens.stop,
    "--bloom-color-stop-latched": tokens.stopLatched,
    "--bloom-color-success": tokens.success,
    "--bloom-color-surface": tokens.surface,
    "--bloom-color-surface-bright": tokens.surfaceBright,
    "--bloom-color-surface-container": tokens.surfaceContainer,
    "--bloom-color-surface-container-high": tokens.surfaceContainerHigh,
    "--bloom-color-surface-container-low": tokens.surfaceContainerLow,
    "--bloom-color-surface-soft": tokens.surfaceSoft,
    "--bloom-color-unavailable-outline": tokens.unavailableOutline,
    // Aliases resolved at :root would otherwise keep the Bloom palette under every other preset.
    "--bloom-accent": tokens.secondary,
    "--bloom-accent-strong": tokens.primary,
    "--bloom-border": tokens.outline,
    "--bloom-muted": tokens.muted,
    "--bloom-panel": translucent(tokens.surface, 90),
    "--bloom-pollen": tokens.pollen,
    "--bloom-lilac": tokens.lilac,
    "--bloom-sand": tokens.surfaceContainer,
    "--bloom-surface-soft": tokens.surfaceContainerHigh,
    "--bloom-warning": tokens.error,
    "--bloom-error": tokens.error,
    "--bloom-error-container": tokens.errorContainer,
    "--bloom-danger": tokens.error,
    "--bloom-danger-container": tokens.errorContainer,
    "--bloom-focus-ring": tokens.focusRing,
    "--bloom-focus-ring-contrast": tokens.focusRingContrast,
    "--bloom-ink": tokens.onSurface,
    "--bloom-ink-soft": tokens.onSurfaceMuted,
    "--bloom-ink-muted": tokens.onSurfaceMuted,
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
    "--bloom-surface-bright": tokens.surfaceBright,
    "--bloom-surface-container": tokens.surfaceContainer,
    "--bloom-surface-container-high": tokens.surfaceContainerHigh,
    "--bloom-surface-container-low": tokens.surfaceContainerLow,
    "--bloom-stop": tokens.stop,
    "--bloom-on-stop": tokens.onStop,
    "--bloom-stop-latched": tokens.stopLatched,
    "--bloom-on-stop-latched": tokens.onStopLatched,
    "--bloom-success": tokens.success,
    "--bloom-on-success": tokens.onSuccess,
    "--bloom-unavailable-outline": tokens.unavailableOutline,
    "--bloom-hairline": tokens.hairline,
    "--bloom-hairline-strong": tokens.hairlineStrong,
    "--bloom-command": tokens.command,
    "--bloom-shadow-color": tokens.shadow,
    "--bloom-shadow-soft": `0 18px 42px ${translucent(tokens.shadow, 14)}`,
    "--bloom-shadow-card": `0 22px 54px ${translucent(tokens.shadow, 12)}`,
    "--bloom-shadow": `0 22px 54px ${translucent(tokens.shadow, 12)}`,
    ...series,
    "--bloom-axis-translation": tokens.series2,
    "--bloom-axis-rotation": tokens.series3,
    ...shape,
  } as CSSProperties;
}

export function seriesStyle(index: number): { color: string; dashed: boolean } {
  const position = ((index % BLOOM_SERIES_RAMP.length) + BLOOM_SERIES_RAMP.length) % BLOOM_SERIES_RAMP.length;
  return { color: `var(--bloom-series-${position + 1})`, dashed: index >= BLOOM_SERIES_RAMP.length };
}
