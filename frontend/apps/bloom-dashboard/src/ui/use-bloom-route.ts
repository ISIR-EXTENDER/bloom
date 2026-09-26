import { useEffect, useRef, useState } from "react";
import { type BloomRoute, parseBloomRoute, routeToHash } from "./navigationRoute";
import { confirmLeavingUnsaved } from "./unsaved-changes";

/** The hash route as state: browser history changes it, `navigate` pushes it. */
export function useBloomRoute() {
  const [route, setRoute] = useState<BloomRoute>(readBrowserRoute);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    // Back and Forward ask about unsaved work too; refused, the page stays where it is. Both events fire for
    // one step, so the second sees the route already settled and asks nothing.
    const syncRouteFromBrowserHistory = () => {
      const next = readBrowserRoute();
      const current = routeToHash(routeRef.current);
      if (routeToHash(next) === current) {
        return;
      }
      if (!confirmLeavingUnsaved()) {
        window.history.pushState(null, "", current);
        return;
      }
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener("hashchange", syncRouteFromBrowserHistory);
    window.addEventListener("popstate", syncRouteFromBrowserHistory);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromBrowserHistory);
      window.removeEventListener("popstate", syncRouteFromBrowserHistory);
    };
  }, []);

  const navigate = (nextRoute: BloomRoute) => {
    setRoute(nextRoute);
    if (typeof window === "undefined") {
      return;
    }

    const nextHash = routeToHash(nextRoute);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
  };

  return { navigate, route };
}

function readBrowserRoute(): BloomRoute {
  return parseBloomRoute(typeof window === "undefined" ? "" : window.location.hash);
}
