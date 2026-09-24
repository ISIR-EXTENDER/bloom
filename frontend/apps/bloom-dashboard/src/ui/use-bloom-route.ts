import { useEffect, useState } from "react";
import { type BloomRoute, parseBloomRoute, routeToHash } from "./navigationRoute";

/** The hash route as state: browser history changes it, `navigate` pushes it. */
export function useBloomRoute() {
  const [route, setRoute] = useState<BloomRoute>(readBrowserRoute);

  useEffect(() => {
    const syncRouteFromBrowserHistory = () => setRoute(readBrowserRoute());
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
