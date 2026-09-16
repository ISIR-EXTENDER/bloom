/**
 * Whether a widget can actually do its job in this backend, and if not, why.
 *
 * The builder used to offer every widget unconditionally. A colleague reviewing
 * Bloom pointed out that it should only offer what has a real connection behind
 * it, and he was right: without ROS attached, a joystick places happily and
 * moves nothing, and a plot sits on "Waiting for messages..." forever with no
 * way to tell that from a robot that has not started publishing.
 *
 * The metadata to answer this already existed and was inert.
 * `runtimeRequirements` had seven values and zero readers. This resolves those
 * requirements against `GET /api/v1/capabilities`, which reports the seams the
 * backend really has wired.
 *
 * Widgets that cannot work here are still offered, marked and explained. Hiding
 * them would leave someone wondering why a widget vanished, which is the
 * failure this is meant to end, not repeat.
 */

import type { WidgetDefinition, WidgetRuntimeRequirement } from "./index";

export type RuntimeCapability = {
  id: string;
  available: boolean;
  detail: string;
};

export type WidgetReadinessState = "ready" | "preview" | "unavailable" | "unknown";

export type WidgetReadiness = {
  state: WidgetReadinessState;
  /** One line for the palette, or null when there is nothing worth saying. */
  note: string | null;
  /** Requirements this backend cannot serve. */
  missing: WidgetRuntimeRequirement[];
};

const REQUIREMENT_LABELS: Record<WidgetRuntimeRequirement, string> = {
  none: "no backend connection",
  "command-dispatcher": "a ROS connection to publish commands",
  "data-source": "a ROS connection to read topics",
  "service-dispatcher": "a ROS connection to call services",
  "teleop-adapter": "a teleop connection to the manager",
};

function joinRequirements(requirements: WidgetRuntimeRequirement[]): string {
  const labels = requirements.map((requirement) => REQUIREMENT_LABELS[requirement]);
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Resolve one widget against the reported capabilities.
 *
 * `capabilities` is null while they have not been fetched, or when the backend
 * is too old to report them. That is `unknown`, not `unavailable`: claiming a
 * widget is broken because we have not asked yet would be its own lie.
 */
export function resolveWidgetReadiness(
  definition: Pick<WidgetDefinition, "runtimeRequirements" | "maturity" | "maturityNote">,
  capabilities: readonly RuntimeCapability[] | null,
): WidgetReadiness {
  const required = definition.runtimeRequirements.filter((requirement) => requirement !== "none");

  if (required.length === 0) {
    return {
      state: definition.maturity === "preview" ? "preview" : "ready",
      note: definition.maturityNote ?? null,
      missing: [],
    };
  }

  if (capabilities === null) {
    return { state: "unknown", note: null, missing: [] };
  }

  const missing = required.filter(
    (requirement) => !capabilities.some((capability) => capability.id === requirement && capability.available),
  );

  if (missing.length > 0) {
    return {
      state: "unavailable",
      note: `Needs ${joinRequirements(missing)}. It can be placed now, but will do nothing until that is connected.`,
      missing,
    };
  }

  return {
    state: definition.maturity === "preview" ? "preview" : "ready",
    note: definition.maturityNote ?? null,
    missing: [],
  };
}

/** Prefer the backend's concrete failure detail, with a stable fallback for omitted capabilities. */
export function describeUnavailableWidgetRuntime(
  readiness: WidgetReadiness,
  capabilities: readonly RuntimeCapability[],
): string | null {
  if (readiness.state !== "unavailable") {
    return null;
  }

  const details = readiness.missing
    .map((requirement) => capabilities.find((capability) => capability.id === requirement)?.detail.trim())
    .filter((detail): detail is string => Boolean(detail));
  if (details.length === readiness.missing.length) {
    return details.join(" ");
  }

  return `Needs ${joinRequirements(readiness.missing)}.`;
}
