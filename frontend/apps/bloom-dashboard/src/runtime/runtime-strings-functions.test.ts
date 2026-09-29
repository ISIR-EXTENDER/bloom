import { describe, expect, it } from "vitest";
import { getRuntimeStrings } from "./strings";

const LANGUAGES = ["en", "fr", "es"] as const;

/** Sample arguments by parameter name, so each sentence is built with what the runtime gives it. */
const SAMPLE: Record<string, string | number> = {
  applicationName: "Explorer",
  appName: "Explorer",
  complete: 2,
  controlName: "Height",
  count: 3,
  current: 2,
  detail: "not a valid name",
  directionLabel: "up",
  fontScale: 1.25,
  frameId: "effector_frame",
  height: 720,
  hz: 20,
  label: "Open",
  method: "dwell",
  name: "Robin",
  owner: "tablet-1",
  parameters: "shapers.snake.gain",
  percent: 80,
  profileName: "Switch user",
  px: 48,
  role: "operator",
  screen: "Arm",
  screenTitle: "Arm",
  seconds: 7,
  step: 3,
  targetPx: 44,
  timing: "slow",
  title: "Gripper",
  topic: "/ee_pose",
  total: 5,
  value: "0.4",
  width: 1280,
};

function parameterNames(fn: (...args: never[]) => unknown): string[] {
  const source = fn.toString();
  const list = source.match(/^\s*(?:async\s*)?\(?([^)=]*?)\)?\s*=>/)?.[1] ?? source.match(/\(([^)]*)\)/)?.[1] ?? "";
  return list
    .split(",")
    .map((name) => name.trim().split(/[:=]/)[0]?.trim() ?? "")
    .filter(Boolean);
}

function walk(value: unknown, path: string, visit: (path: string, fn: (...args: never[]) => unknown) => void) {
  if (typeof value === "function") {
    visit(path, value as (...args: never[]) => unknown);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      walk(nested, path ? `${path}.${key}` : key, visit);
    }
  }
}

describe("runtime sentences with arguments", () => {
  it.each(LANGUAGES)("%s: every sentence carries each argument it is given, and is never empty", (language) => {
    const checked: string[] = [];
    walk(getRuntimeStrings(language), "", (path, fn) => {
      const names = parameterNames(fn);
      const args = names.map((name) => {
        if (!(name in SAMPLE)) {
          throw new Error(`${path}: no sample for parameter ${name}`);
        }
        return SAMPLE[name];
      });
      const text = (fn as (...args: unknown[]) => unknown)(...args);
      expect(typeof text, path).toBe("string");
      expect(text, path).not.toBe("");
      // A count may be worded ("twice"); a name or a topic must appear as given.
      for (const argument of args.filter((candidate) => typeof candidate === "string")) {
        expect(String(text), `${language}.${path} must carry ${argument}`).toContain(argument);
      }
      checked.push(path);
    });
    expect(checked.length).toBeGreaterThan(5);
  });
});
