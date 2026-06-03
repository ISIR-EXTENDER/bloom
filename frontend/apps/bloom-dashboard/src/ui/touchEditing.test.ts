import { describe, expect, it } from "vitest";
import { getTouchEditingProps } from "./touchEditing";

describe("touch editing props", () => {
  it("keeps structured payload editing stable on touch keyboards", () => {
    expect(getTouchEditingProps("json")).toEqual({
      autoCapitalize: "none",
      autoComplete: "off",
      autoCorrect: "off",
      enterKeyHint: "done",
      inputMode: "text",
      spellCheck: false,
    });
  });

  it("uses URL keyboard hints for website references", () => {
    expect(getTouchEditingProps("url")).toEqual({
      autoCapitalize: "none",
      autoComplete: "url",
      autoCorrect: "off",
      enterKeyHint: "done",
      inputMode: "url",
      spellCheck: false,
    });
  });

  it("keeps names human-friendly while disabling browser autocomplete", () => {
    expect(getTouchEditingProps("name")).toMatchObject({
      autoCapitalize: "words",
      autoComplete: "off",
      enterKeyHint: "done",
      inputMode: "text",
      spellCheck: true,
    });
  });
});
