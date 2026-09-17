import type { WidgetActionIntent } from "@bloom/widgets";

export type RuntimeIntentRefusal = "held" | "not-owner" | "stopped" | "unavailable";

/**
 * Why the runtime shell refuses a widget intent before it reaches the robot, or
 * null to let it through. A release passes an unavailable control, and passes
 * while maintenance holds the robot: that is exactly when the operator needs to let go.
 */
export function resolveRuntimeIntentRefusal(
  intent: WidgetActionIntent,
  options: { held?: boolean; ownsControl: boolean; stopped?: boolean; unavailable: boolean },
): RuntimeIntentRefusal | null {
  if (!options.ownsControl) {
    return "not-owner";
  }
  // The stopped canvas refuses pointers in CSS, which arrow keys on an already
  // focused pad and an assistive activation both walk past.
  if (options.stopped && !isReleaseIntent(intent)) {
    return "stopped";
  }
  if (options.held && !isReleaseIntent(intent)) {
    return "held";
  }
  if (options.unavailable && !isReleaseIntent(intent)) {
    return "unavailable";
  }
  return null;
}

function isReleaseIntent(intent: WidgetActionIntent): boolean {
  if (intent.type === "topic-publish") {
    return intent.release === true;
  }
  // A teleop control returning to zero is letting go of its contribution.
  if (intent.type === "value-change") {
    const { value } = intent;
    if (typeof value === "number") {
      return value === 0;
    }
    return "x" in value && "y" in value && value.x === 0 && value.y === 0;
  }
  return false;
}
