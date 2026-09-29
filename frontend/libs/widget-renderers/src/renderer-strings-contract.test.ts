import { describe, expect, it } from "vitest";
import { type RendererStrings, rendererStrings } from "./renderer-strings";

const LANGUAGES = ["en", "fr", "es"] as const;

/** Sample arguments by parameter name, so a function string is checked with what it will be given. */
const SAMPLE = {
  count: 1,
  degrees: 12,
  detail: "not a valid name",
  driven: 2,
  label: "Open",
  live: "2 live joints",
  millimetres: 34,
  name: "Pose 3",
  seconds: 7,
  step: 3,
  time: "10:42",
  title: "Gripper",
  topic: "/ee_pose",
  total: 7,
} as const;

function argumentsFor(fn: (...args: never[]) => string): unknown[] {
  const names = fn
    .toString()
    .match(/^\(?([^)=]*)\)?\s*=>/)?.[1]
    .split(",")
    .map((name) => name.trim().split(":")[0]?.trim())
    .filter(Boolean) as (keyof typeof SAMPLE)[];
  return names.map((name) => {
    if (!(name in SAMPLE)) {
      throw new Error(`no sample for parameter ${name}`);
    }
    return SAMPLE[name];
  });
}

describe("renderer strings", () => {
  it("fall back to English for an unknown language", () => {
    expect(rendererStrings(undefined)).toBe(rendererStrings("en"));
    expect(rendererStrings("de" as never)).toBe(rendererStrings("en"));
  });

  it.each(LANGUAGES)(
    "%s: has every word English has, of the same shape, and puts each argument in its sentence",
    (language) => {
      const english = rendererStrings("en") as Record<string, unknown>;
      const table = rendererStrings(language) as Record<string, unknown>;
      expect(Object.keys(table).sort()).toEqual(Object.keys(english).sort());
      for (const [key, reference] of Object.entries(english)) {
        const value = table[key];
        expect(typeof value, key).toBe(typeof reference);
        if (typeof reference === "function" && typeof value === "function") {
          const args = argumentsFor(reference as (...args: never[]) => string);
          const text = (value as (...args: unknown[]) => string)(...args);
          expect(text, key).not.toBe("");
          for (const argument of args) {
            expect(text, `${language}.${key} must carry ${String(argument)}`).toContain(String(argument));
          }
        } else if (typeof reference === "object" && reference !== null) {
          expect(Object.keys(value as object).sort(), key).toEqual(Object.keys(reference).sort());
        }
      }
    },
  );

  it("count one and many differently in every language", () => {
    for (const language of LANGUAGES) {
      const text: RendererStrings = rendererStrings(language);
      expect(text.sampleCount(1)).not.toBe(text.sampleCount(2).replace("2", "1"));
      expect(text.eventCount(1)).not.toBe(text.eventCount(2).replace("2", "1"));
      expect(text.liveJoints(1)).not.toBe(text.liveJoints(2).replace("2", "1"));
      expect(text.liveJoints(3)).toContain("3");
    }
  });
});
