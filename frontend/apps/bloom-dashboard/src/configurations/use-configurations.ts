import { useEffect, useState } from "react";

import type { ConfigurationClient } from "./configuration-client";
import { loadConfigurations, type LoadedConfiguration } from "./configuration-loader";

export type ConfigurationLoadState =
  | { status: "loading" }
  | { status: "ready"; configurations: LoadedConfiguration[] }
  | { status: "error"; message: string };

export function useConfigurations(client: ConfigurationClient): ConfigurationLoadState {
  const [state, setState] = useState<ConfigurationLoadState>({ status: "loading" });

  useEffect(() => {
    let isCurrent = true;
    setState({ status: "loading" });

    loadConfigurations(client)
      .then((configurations) => {
        if (isCurrent) {
          setState({ status: "ready", configurations });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({ status: "error", message: getErrorMessage(error) });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [client]);

  return state;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom could not load configurations.";
}
