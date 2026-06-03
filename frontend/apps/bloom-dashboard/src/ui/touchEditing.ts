import type { InputHTMLAttributes } from "react";

export type TouchEditingKind = "json" | "name" | "number" | "text" | "url";

type TouchEditingProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "autoCapitalize" | "autoComplete" | "autoCorrect" | "enterKeyHint" | "inputMode" | "spellCheck"
>;

export function getTouchEditingProps(kind: TouchEditingKind): TouchEditingProps {
  switch (kind) {
    case "json":
      return {
        autoCapitalize: "none",
        autoComplete: "off",
        autoCorrect: "off",
        enterKeyHint: "done",
        inputMode: "text",
        spellCheck: false,
      };
    case "name":
      return {
        autoCapitalize: "words",
        autoComplete: "off",
        enterKeyHint: "done",
        inputMode: "text",
        spellCheck: true,
      };
    case "number":
      return {
        autoComplete: "off",
        enterKeyHint: "done",
        inputMode: "decimal",
        spellCheck: false,
      };
    case "url":
      return {
        autoCapitalize: "none",
        autoComplete: "url",
        autoCorrect: "off",
        enterKeyHint: "done",
        inputMode: "url",
        spellCheck: false,
      };
    case "text":
      return {
        autoComplete: "off",
        enterKeyHint: "done",
        inputMode: "text",
        spellCheck: true,
      };
  }
}
