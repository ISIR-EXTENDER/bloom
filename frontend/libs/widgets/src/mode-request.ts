import { isRecord } from "./values";

/** The cartesian_manager mode grammar, as backend/libs/ros_adapters/mode_request.py parses it. */
export const GEOMETRIC_MODES = ["both", "jaco", "snake"] as const;

export type ModeRequestParse = { normalized: string; ok: true } | { error: string; ok: false };

export function normalizeModeRequest(raw: string): string {
  return raw.trim().toLowerCase().replaceAll("-", "_");
}

export function parseModeRequest(raw: string): ModeRequestParse {
  const normalized = normalizeModeRequest(raw);
  const fail = (error: string): ModeRequestParse => ({ error, ok: false });
  if (!normalized) {
    return fail("mode request is empty");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part)) {
    return fail("mode request has an empty path segment");
  }
  if (parts.length < 2) {
    return fail("mode request needs at least two segments, such as geometric/both");
  }
  const [family, name] = parts;
  if (family === "geometric") {
    if (parts.length !== 2) {
      return fail("geometric mode request takes exactly one name");
    }
    return (GEOMETRIC_MODES as readonly string[]).includes(name ?? "")
      ? { normalized, ok: true }
      : fail(`unknown geometric mode '${name}', expected one of ${GEOMETRIC_MODES.join(", ")}`);
  }
  if (family === "behaviour") {
    if (name === "passthrough") {
      return parts.length === 2 ? { normalized, ok: true } : fail("behaviour/passthrough takes no extra segment");
    }
    if (name === "joint_target" || name === "pose_target") {
      return parts.length === 3
        ? { normalized, ok: true }
        : fail(`behaviour/${name} needs a target name, such as behaviour/${name}/home`);
    }
    if (name === "shared_control") {
      return parts.length === 2 || (parts.length === 3 && parts[2] === "reset")
        ? { normalized, ok: true }
        : fail("behaviour/shared_control takes only an optional /reset");
    }
    if (name === "intent_scaling") {
      return parts.length === 2 ? { normalized, ok: true } : fail("behaviour/intent_scaling takes no extra segment");
    }
    return fail(
      `unknown behaviour '${name}', expected passthrough, joint_target, pose_target, shared_control or intent_scaling`,
    );
  }
  return fail(`unknown mode family '${family}', expected geometric or behaviour`);
}

/** The server checks the grammar on any topic ending in mode_request. */
export function isModeRequestTopic(topic: string | null | undefined): boolean {
  return typeof topic === "string" && topic.trim().endsWith("mode_request");
}

/** The `data` string a String payload carries, held as an object or as ROS text; null when it cannot be read. */
export function readModeRequestData(payload: unknown): string | null {
  if (isRecord(payload)) {
    return typeof payload.data === "string" ? payload.data : null;
  }
  if (typeof payload !== "string" || !payload.trim()) {
    return null;
  }
  try {
    return readModeRequestData(JSON.parse(payload));
  } catch {
    const match = /^\{?\s*data\s*:\s*(['"]?)(.*?)\1\s*\}?$/.exec(payload.trim());
    return match ? (match[2] ?? null) : null;
  }
}
