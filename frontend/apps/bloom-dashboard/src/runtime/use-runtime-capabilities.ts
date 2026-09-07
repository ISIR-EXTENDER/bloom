import type { RuntimeCapability } from "@bloom/api-client";
import { useEffect, useState } from "react";

/**
 * What the backend can actually do, asked once.
 *
 * `null` means not known yet -- either the request has not finished, or this
 * backend is too old to answer. Callers must treat that as unknown rather than
 * as "nothing works", or the builder would mark every ROS widget broken for the
 * moment before the answer arrives.
 */
export type RuntimeCapabilityClient = {
  listRuntimeCapabilities?: () => Promise<RuntimeCapability[]>;
};

export function useRuntimeCapabilities(
  client: RuntimeCapabilityClient | null | undefined,
): readonly RuntimeCapability[] | null {
  const [capabilities, setCapabilities] = useState<readonly RuntimeCapability[] | null>(null);

  useEffect(() => {
    if (!client?.listRuntimeCapabilities) {
      return;
    }

    let cancelled = false;
    client
      .listRuntimeCapabilities()
      .then((next) => {
        if (!cancelled) {
          setCapabilities(next);
        }
      })
      .catch(() => {
        // A backend that cannot answer leaves this unknown. Guessing
        // "unavailable" would put a warning on every ROS widget purely because
        // the request failed.
        if (!cancelled) {
          setCapabilities(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  return capabilities;
}
