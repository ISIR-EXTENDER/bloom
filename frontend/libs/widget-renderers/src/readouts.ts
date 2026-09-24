/** Signed to two places with a true minus, the way every design readout prints. */
export function formatSignedValue(value: number): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded < 0 ? "\u2212" : "+"}${Math.abs(rounded).toFixed(2)}`;
}

export function resolveDecimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 2;
  }

  const stepText = step.toString();
  if (!stepText.includes(".")) {
    return 0;
  }

  return Math.min(4, stepText.split(".")[1]?.length ?? 2);
}
