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
    expect(parseBloomRoute("#/runtime/supervisor/explorer-manager/explorer-manager")).toEqual(
      runtimeModeRoute("supervisor", { appId: "explorer-manager", configId: "explorer-manager" }),
    );
    expect(parseBloomRoute("#/help")).toEqual(productViewRoute("help"));
  });

  it("falls back to the landing page for unknown routes", () => {
    expect(parseBloomRoute("#/old-route")).toEqual(DEFAULT_BLOOM_ROUTE);
    expect(parseBloomRoute("#/runtime/supervisor/%E0%A4%A/explorer")).toEqual(DEFAULT_BLOOM_ROUTE);
  });

  it("serializes Bloom routes to stable hashes", () => {
    expect(routeToHash(DEFAULT_BLOOM_ROUTE)).toBe("#/");
    expect(routeToHash(builderModeRoute("home"))).toBe("#/builder");
    expect(routeToHash(builderModeRoute("app-config"))).toBe("#/builder/app");
    expect(routeToHash(builderModeRoute("screen-builder"))).toBe("#/builder/screen");
    expect(routeToHash(runtimeModeRoute("home"))).toBe("#/runtime");
    expect(routeToHash(runtimeModeRoute("app"))).toBe("#/runtime/app");
    expect(routeToHash(runtimeModeRoute("supervisor", { appId: "explorer manager", configId: "lab/explorer" }))).toBe(
      "#/runtime/supervisor/lab%2Fexplorer/explorer%20manager",
    );
    expect(routeToHash(productViewRoute("help"))).toBe("#/help");
  });
});

describe("the library shortcut route", () => {
  // The landing shortcuts and a tablet bookmark both land on the library with one app focused.
  // Opening a role stays the person's own press: the route never launches anything.
  it("parses a focused library entry and round-trips it", () => {
    const route = parseBloomRoute("#/runtime/open/explorer-manager/explorer-manager");

    expect(route.activeView).toBe("runtime");
    expect(route.runtimeMode).toBe("home");
    expect(route.libraryTarget).toEqual({ configId: "explorer-manager", appId: "explorer-manager" });
    expect(routeToHash(route)).toBe("#/runtime/open/explorer-manager/explorer-manager");
  });

  it("falls back to the landing on a malformed target", () => {
    expect(parseBloomRoute("#/runtime/open/only-one-part")).toEqual(DEFAULT_BLOOM_ROUTE);
  });
});
