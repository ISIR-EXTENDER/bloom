import { BloomApiError } from "@bloom/api-client";

/**
 * What the server actually objected to.
 *
 * `BloomApiError.message` is only ever the status line, and the reason a save was refused -- a
 * duplicate id, a widget over a reserved region, a name too short -- travels in the body. Three
 * builder paths showed the status line alone, which tells an author working without help nothing at
 * all about what to change.
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof BloomApiError) {
    const detail = readDetail(error.responseText);
    return detail ? `${error.message} ${detail}` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function readDetail(responseText: string): string {
  if (!responseText) {
    return "";
  }
  try {
    const parsed = JSON.parse(responseText) as { detail?: unknown };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    // FastAPI's validation errors arrive as a list of {loc, msg}.
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((entry) =>
          typeof entry === "object" && entry !== null && typeof (entry as { msg?: unknown }).msg === "string"
            ? (entry as { msg: string }).msg
            : "",
        )
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    // A body that is not JSON tells us nothing more than the status already did.
  }
  return "";
}
