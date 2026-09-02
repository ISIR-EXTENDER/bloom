import type { CanvasSettings } from "@bloom/api-client";

/**
 * What an unspecified canvas means.
 *
 * This lives in a leaf module rather than in `index.ts` because the legacy
 * importer needs it too, and `index.ts` re-exports the legacy module: importing
 * back from the barrel would make the two files circular.
 *
 * It exists so the importer and the widget library cannot drift on the default.
 * Both previously carried their own copy of the same two values.
 */
export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  preset_id: "hd",
  runtime_mode: "fit",
};
