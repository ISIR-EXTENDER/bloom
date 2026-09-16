import type { RuntimeLanguage } from "@bloom/api-client";

import { enRuntimeStrings } from "./en";
import { esRuntimeStrings } from "./es";
import { frRuntimeStrings } from "./fr";
import type { RuntimeStrings } from "./types";

const RUNTIME_STRINGS: Record<RuntimeLanguage, RuntimeStrings> = {
  en: enRuntimeStrings,
  es: esRuntimeStrings,
  fr: frRuntimeStrings,
};

export function getRuntimeStrings(language: RuntimeLanguage): RuntimeStrings {
  return RUNTIME_STRINGS[language] ?? enRuntimeStrings;
}

export function useRuntimeStrings(language: RuntimeLanguage): RuntimeStrings {
  return getRuntimeStrings(language);
}

export function pseudoLocalizeRuntimeStrings(strings: RuntimeStrings = enRuntimeStrings): RuntimeStrings {
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      return pseudoLocalizeText(value);
    }
    if (typeof value === "function") {
      return (...args: unknown[]) => pseudoLocalizeText(String(value(...args)));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, visit(nested)]));
    }
    return value;
  };
  return { ...(visit(strings) as RuntimeStrings), language: strings.language };
}

function pseudoLocalizeText(value: string): string {
  const accented = value.replace(/[A-Za-z]/g, (character) => PSEUDO_ACCENTS[character] ?? character);
  return `[${accented}${"~".repeat(Math.ceil(value.length * 0.4))}]`;
}

const PSEUDO_ACCENTS: Record<string, string> = {
  A: "Å",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "Ë",
  F: "F",
  G: "G",
  H: "H",
  I: "Ï",
  J: "J",
  K: "K",
  L: "Ŀ",
  M: "M",
  N: "Ñ",
  O: "Ø",
  P: "P",
  Q: "Q",
  R: "R",
  S: "Š",
  T: "T",
  U: "Ü",
  V: "V",
  W: "Ŵ",
  X: "X",
  Y: "Ÿ",
  Z: "Ž",
  a: "å",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "ë",
  f: "f",
  g: "g",
  h: "h",
  i: "ï",
  j: "j",
  k: "k",
  l: "ŀ",
  m: "m",
  n: "ñ",
  o: "ø",
  p: "p",
  q: "q",
  r: "r",
  s: "š",
  t: "t",
  u: "ü",
  v: "v",
  w: "ŵ",
  x: "x",
  y: "ÿ",
  z: "ž",
};

export type { RuntimeStrings } from "./types";
