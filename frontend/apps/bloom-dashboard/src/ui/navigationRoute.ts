import type { ProductView } from "./ProductNavigation";

export type BuilderRouteMode = "app-config" | "home" | "screen-builder";
export type RuntimeRouteMode = "app" | "home";

export type BloomRoute = {
  activeView: ProductView;
  builderMode: BuilderRouteMode;
  runtimeMode: RuntimeRouteMode;
};

export const DEFAULT_BLOOM_ROUTE: BloomRoute = {
  activeView: "landing",
  builderMode: "home",
  runtimeMode: "home",
};

export function parseBloomRoute(hash: string): BloomRoute {
  const normalizedHash = hash.replace(/^#/, "").replace(/^\/?/, "/");

  switch (normalizedHash) {
    case "":
    case "/":
    case "/home":
      return DEFAULT_BLOOM_ROUTE;
    case "/builder":
    case "/builder/home":
      return { ...DEFAULT_BLOOM_ROUTE, activeView: "builder", builderMode: "home" };
    case "/builder/app":
      return { ...DEFAULT_BLOOM_ROUTE, activeView: "builder", builderMode: "app-config" };
    case "/builder/screen":
      return { ...DEFAULT_BLOOM_ROUTE, activeView: "builder", builderMode: "screen-builder" };
    case "/runtime":
    case "/runtime/home":
      return { ...DEFAULT_BLOOM_ROUTE, activeView: "runtime", runtimeMode: "home" };
    case "/runtime/app":
      return { ...DEFAULT_BLOOM_ROUTE, activeView: "runtime", runtimeMode: "app" };
    case "/help":
      return { ...DEFAULT_BLOOM_ROUTE, activeView: "help" };
    default:
      return DEFAULT_BLOOM_ROUTE;
  }
}

export function routeToHash(route: BloomRoute): string {
  if (route.activeView === "builder") {
    return route.builderMode === "home" ? "#/builder" : `#/builder/${builderModeToPath(route.builderMode)}`;
  }

  if (route.activeView === "runtime") {
    return route.runtimeMode === "home" ? "#/runtime" : "#/runtime/app";
  }

  if (route.activeView === "help") {
    return "#/help";
  }

  return "#/";
}

export function productViewRoute(view: ProductView): BloomRoute {
  if (view === "builder") {
    return { ...DEFAULT_BLOOM_ROUTE, activeView: "builder", builderMode: "home" };
  }

  if (view === "runtime") {
    return { ...DEFAULT_BLOOM_ROUTE, activeView: "runtime", runtimeMode: "home" };
  }

  if (view === "help") {
    return { ...DEFAULT_BLOOM_ROUTE, activeView: "help" };
  }

  return DEFAULT_BLOOM_ROUTE;
}

export function builderModeRoute(builderMode: BuilderRouteMode): BloomRoute {
  return { ...DEFAULT_BLOOM_ROUTE, activeView: "builder", builderMode };
}

export function runtimeModeRoute(runtimeMode: RuntimeRouteMode): BloomRoute {
  return { ...DEFAULT_BLOOM_ROUTE, activeView: "runtime", runtimeMode };
}

function builderModeToPath(builderMode: BuilderRouteMode): string {
  if (builderMode === "screen-builder") {
    return "screen";
  }

  if (builderMode === "app-config") {
    return "app";
  }

  return "home";
}
