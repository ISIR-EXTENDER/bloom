import type { WidgetActionIntent } from "@bloom/widgets";

export type RuntimeIntentRefusal = "not-owner" | "unavailable";

/**
 * Why the runtime shell refuses a widget intent before it reaches the robot, or
 * null to let it through. A release of a held command passes an unavailable
 * control: that is exactly when the operator needs to let go.
 */
export function resolveRuntimeIntentRefusal(
  intent: WidgetActionIntent,
  options: { ownsControl: boolean; unavailable: boolean },
): RuntimeIntentRefusal | null {
  if (!options.ownsControl) {
    return "not-owner";
  }
  if (options.unavailable && !isReleaseIntent(intent)) {
    return "unavailable";
  }
  return null;
}

function isReleaseIntent(intent: WidgetActionIntent): boolean {
  return intent.type === "topic-publish" && intent.release === true;
}
