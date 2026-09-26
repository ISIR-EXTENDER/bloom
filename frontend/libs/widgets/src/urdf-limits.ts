/**
 * Each bounded joint's range, read from the robot's own URDF. The joint table's limit column needed the
 * ranges typed as JSON, although the API already serves the description that holds them. Continuous joints
 * have no range and are left out.
 */
export function readUrdfJointLimits(urdf: string): Record<string, readonly [number, number]> {
  const limits: Record<string, readonly [number, number]> = {};
  // A self-closing <joint/> has no body; matched as an open tag, its lazy body ran on into the next joint.
  for (const [, attributes = "", body = ""] of urdf.matchAll(/<joint\b([^>]*?)(?:\/>|>([\s\S]*?)<\/joint>)/g)) {
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

/** Joints that turn without end: no limit is right for them, and "not reported" read as missing data. */
export function readUrdfContinuousJoints(urdf: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const [, attributes = ""] of urdf.matchAll(/<joint\b([^>]*?)(?:\/>|>)/g)) {
    const name = readAttribute(attributes, "name");
    if (name && readAttribute(attributes, "type") === "continuous") {
      names.add(name);
    }
  }
  return names;
}
