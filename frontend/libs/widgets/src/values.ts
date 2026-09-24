/** Settings, samples and stored preferences arrive as JSON, so a value may be anything. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
