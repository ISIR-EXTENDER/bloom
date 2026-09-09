import type { RuntimeCapabilityReport } from "@bloom/api-client";
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
  listRuntimeCapabilities?: () => Promise<RuntimeCapabilityReport>;
};

export function useRuntimeCapabilityReport(
  client: RuntimeCapabilityClient | null | undefined,
): RuntimeCapabilityReport | null {
  const [report, setReport] = useState<RuntimeCapabilityReport | null>(null);

  useEffect(() => {
    if (!client?.listRuntimeCapabilities) {
      return;
    }

    let cancelled = false;
    client
      .listRuntimeCapabilities()
      .then((next) => {
        if (!cancelled) {
          setReport(next);
        }
      })
      .catch(() => {
        // A backend that cannot answer leaves this unknown. Guessing
        // "unavailable" would put a warning on every ROS widget purely because
        // the request failed.
        if (!cancelled) {
          setReport(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  return report;
}
