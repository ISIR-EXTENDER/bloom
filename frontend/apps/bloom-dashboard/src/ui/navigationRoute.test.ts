import { describe, expect, it } from "vitest";

import {
  builderModeRoute,
  DEFAULT_BLOOM_ROUTE,
  parseBloomRoute,
  productViewRoute,
  routeToHash,
  runtimeModeRoute,
} from "./navigationRoute";

describe("navigationRoute", () => {
  it("parses public Bloom routes from URL hashes", () => {
    expect(parseBloomRoute("")).toEqual(DEFAULT_BLOOM_ROUTE);
    expect(parseBloomRoute("#/builder")).toEqual(builderModeRoute("home"));
    expect(parseBloomRoute("#/builder/app")).toEqual(builderModeRoute("app-config"));
    expect(parseBloomRoute("#/builder/screen")).toEqual(builderModeRoute("screen-builder"));
    expect(parseBloomRoute("#/runtime")).toEqual(runtimeModeRoute("home"));
    expect(parseBloomRoute("#/runtime/app")).toEqual(runtimeModeRoute("app"));
    expect(parseBloomRoute("#/help")).toEqual(productViewRoute("help"));
  });

  it("falls back to the landing page for unknown routes", () => {
    expect(parseBloomRoute("#/old-route")).toEqual(DEFAULT_BLOOM_ROUTE);
  });

  it("serializes Bloom routes to stable hashes", () => {
    expect(routeToHash(DEFAULT_BLOOM_ROUTE)).toBe("#/");
    expect(routeToHash(builderModeRoute("home"))).toBe("#/builder");
    expect(routeToHash(builderModeRoute("app-config"))).toBe("#/builder/app");
    expect(routeToHash(builderModeRoute("screen-builder"))).toBe("#/builder/screen");
    expect(routeToHash(runtimeModeRoute("home"))).toBe("#/runtime");
    expect(routeToHash(runtimeModeRoute("app"))).toBe("#/runtime/app");
    expect(routeToHash(productViewRoute("help"))).toBe("#/help");
  });
});
