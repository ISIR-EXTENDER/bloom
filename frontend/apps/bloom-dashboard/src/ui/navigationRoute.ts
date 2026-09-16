import type { ProductView } from "./ProductNavigation";

export type BuilderRouteMode = "app-config" | "home" | "screen-builder";
export type RuntimeRouteMode = "app" | "home" | "supervisor";

export type SupervisorRouteTarget = {
  appId: string;
  configId: string;
};

export type BloomRoute = {
  activeView: ProductView;
  builderMode: BuilderRouteMode;
  runtimeMode: RuntimeRouteMode;
  supervisorTarget: SupervisorRouteTarget | null;
};

export const DEFAULT_BLOOM_ROUTE: BloomRoute = {
  activeView: "landing",
  builderMode: "home",
  runtimeMode: "home",
  supervisorTarget: null,
};

export function parseBloomRoute(hash: string): BloomRoute {
  const normalizedHash = hash.replace(/^#/, "").replace(/^\/?/, "/");
  const supervisorMatch = normalizedHash.match(/^\/runtime\/supervisor\/([^/]+)\/([^/]+)$/);
  if (supervisorMatch) {
    const configId = tryDecodeRoutePart(supervisorMatch[1]);
    const appId = tryDecodeRoutePart(supervisorMatch[2]);
    if (!configId || !appId) {
      return DEFAULT_BLOOM_ROUTE;
    }
    return {
      ...DEFAULT_BLOOM_ROUTE,
      activeView: "runtime",
      runtimeMode: "supervisor",
      supervisorTarget: { configId, appId },
    };
  }

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

function tryDecodeRoutePart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function routeToHash(route: BloomRoute): string {
  if (route.activeView === "builder") {
    return route.builderMode === "home" ? "#/builder" : `#/builder/${builderModeToPath(route.builderMode)}`;
  }

  if (route.activeView === "runtime") {
    if (route.runtimeMode === "supervisor" && route.supervisorTarget) {
      return `#/runtime/supervisor/${encodeURIComponent(route.supervisorTarget.configId)}/${encodeURIComponent(route.supervisorTarget.appId)}`;
    }
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

export function runtimeModeRoute(
  runtimeMode: RuntimeRouteMode,
  supervisorTarget: SupervisorRouteTarget | null = null,
): BloomRoute {
  return { ...DEFAULT_BLOOM_ROUTE, activeView: "runtime", runtimeMode, supervisorTarget };
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
