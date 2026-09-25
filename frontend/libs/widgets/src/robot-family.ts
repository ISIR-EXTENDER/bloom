export type RobotFamily = "explorer" | "kinova";

/** Which arm a `BLOOM_ROBOT_NAME` names, tolerant of "Kinova Gen3" or "explorer_sim"; undefined when neither. */
export function robotFamily(robotName?: string | null): RobotFamily | undefined {
  const name = (robotName ?? "").toLowerCase();
  if (name.includes("kinova") || name.includes("gen3")) return "kinova";
  if (name.includes("explorer")) return "explorer";
  return undefined;
}
