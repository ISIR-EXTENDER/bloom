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

export type { RuntimeStrings } from "./types";
