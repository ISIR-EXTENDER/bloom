/**
 * Each bounded joint's range, read from the robot's own URDF. The joint table's limit column needed the
 * ranges typed as JSON, although the API already serves the description that holds them. Continuous joints
 * have no range and are left out.
 */
export function readUrdfJointLimits(urdf: string): Record<string, readonly [number, number]> {
  const limits: Record<string, readonly [number, number]> = {};
  for (const [, attributes = "", body = ""] of urdf.matchAll(/<joint\b([^>]*)>([\s\S]*?)<\/joint>/g)) {
    const name = readAttribute(attributes, "name");
    const type = readAttribute(attributes, "type");
    if (!name || (type !== "revolute" && type !== "prismatic")) {
      continue;
    }
    const limitTag = body.match(/<limit\b([^>]*)\/?>/)?.[1] ?? "";
    const lower = Number(readAttribute(limitTag, "lower"));
    const upper = Number(readAttribute(limitTag, "upper"));
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower < upper) {
      limits[name] = [lower, upper];
    }
  }
  return limits;
}

function readAttribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))?.[1];
}
