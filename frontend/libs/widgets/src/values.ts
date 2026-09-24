/** Settings, samples and stored preferences arrive as JSON, so a value may be anything. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** A non-blank string, trimmed. */
export function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

export function readString(value: unknown, fallback: string): string {
  return readOptionalString(value) ?? fallback;
}

export function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readNumber(value: unknown, fallback: number): number {
  return readOptionalNumber(value) ?? fallback;
}

export function getStringSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  return readString(settings[key], fallback);
}

export function getNumberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  return readNumber(settings[key], fallback);
}

export function getBooleanSetting(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

export function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readNumberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

/** Whether a card draws its title; a hidden one still names the widget for assistive tech. */
export function hidesTitle(settings: Record<string, unknown> | undefined): boolean {
  return settings?.hide_title === true;
}
