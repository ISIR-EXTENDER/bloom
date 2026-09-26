import type { RuntimeCapabilityReport } from "@bloom/api-client";
import { readOptionalNumber, type WidgetDestination } from "@bloom/widgets";

export type SpeedLimitCaps = { angular: number; linear: number };

/** The server's defaults (BLOOM_MAX_LINEAR_SPEED_LIMIT, BLOOM_MAX_ANGULAR_SPEED_LIMIT) when the robot does not say. */
export const DEFAULT_SPEED_LIMIT_CAPS: SpeedLimitCaps = { angular: 0.8, linear: 0.3 };

/** The server refuses a speed limit above its cap; name the slider values that would be refused. */
export function describeSpeedCapExcess(
  kind: string,
  destination: WidgetDestination | null,
  settings: Record<string, unknown>,
  caps: SpeedLimitCaps,
): string | null {
  const topic = destination?.direction === "publishes" ? (destination.topic ?? "") : "";
  const cap = topic.endsWith("/max_linear_speed")
    ? { unit: "m/s", value: caps.linear }
    : topic.endsWith("/max_angular_speed")
      ? { unit: "rad/s", value: caps.angular }
      : null;
  if (kind !== "slider" || !cap) {
    return null;
  }
  const segments = Array.isArray(settings.segment_values) ? settings.segment_values : [];
  const over = [
    ["Maximum", settings.max],
    ["Initial value", settings.value],
    ...segments.map((value, index) => [`Segment ${index + 1}`, value] as const),
  ].filter(([, value]) => typeof value === "number" && value > cap.value);
  return over.length === 0
    ? null
    : `This robot refuses a speed limit above ${cap.value} ${cap.unit}, so ${over
        .map(([label, value]) => `${label} (${value})`)
        .join(", ")} will be refused. Lower ${over.length === 1 ? "it" : "them"} to ${cap.value} or less.`;
}

/** The caps the robot reports (`max_linear_speed_limit`, `max_angular_speed_limit`), else the server defaults. */
export function readSpeedLimitCaps(report: RuntimeCapabilityReport | null | undefined): SpeedLimitCaps {
  const fields = (report ?? {}) as Record<string, unknown>;
  return {
    angular: readOptionalNumber(fields.max_angular_speed_limit) ?? DEFAULT_SPEED_LIMIT_CAPS.angular,
    linear: readOptionalNumber(fields.max_linear_speed_limit) ?? DEFAULT_SPEED_LIMIT_CAPS.linear,
  };
}
