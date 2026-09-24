import type { WidgetRendererProps } from "./types";

export const STEP_TARGET_HINTS: Partial<Record<NonNullable<WidgetRendererProps["motorPreset"]>, string>> = {
  dwell: "rest to move",
  scan: "scan",
  step: "step",
};

export type StepTargetPreset = keyof typeof STEP_TARGET_HINTS;

export function resolveStepTargetPreset(motorPreset: WidgetRendererProps["motorPreset"]): StepTargetPreset | null {
  return motorPreset && motorPreset in STEP_TARGET_HINTS ? (motorPreset as StepTargetPreset) : null;
}
