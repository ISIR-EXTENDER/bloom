import { describe, expect, it } from "vitest";
import { rendererStrings } from "./renderer-strings";

const keysOf = (value: unknown, prefix = ""): string[] =>
  typeof value === "object" && value !== null
    ? Object.entries(value).flatMap(([key, item]) => keysOf(item, `${prefix}${key}.`))
    : [prefix.slice(0, -1)];

describe("the renderer strings", () => {
  it("carry the same keys in every language", () => {
    const english = keysOf(rendererStrings("en")).sort();
    expect(keysOf(rendererStrings("es")).sort()).toEqual(english);
    expect(keysOf(rendererStrings("fr")).sort()).toEqual(english);
  });
});
