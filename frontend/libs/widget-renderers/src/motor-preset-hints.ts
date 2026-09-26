import type { WidgetRendererProps } from "./types";

export type StepTargetPreset = "dwell" | "scan" | "step";

/** English fallback; the renderers show `rendererStrings(language).stepHints`. */
export const STEP_TARGET_HINTS: Record<StepTargetPreset, string> = {
  dwell: "rest to move",
  scan: "scan",
  step: "step",
};

export function resolveStepTargetPreset(motorPreset: WidgetRendererProps["motorPreset"]): StepTargetPreset | null {
  return motorPreset && motorPreset in STEP_TARGET_HINTS ? (motorPreset as StepTargetPreset) : null;
}
