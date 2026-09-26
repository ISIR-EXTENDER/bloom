import { BloomApiError, type SavedPosition, type SavedPositionScope } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState } from "react";

export type PositionLibraryClient = {
  deleteSavedPosition?: (name: string, scope?: SavedPositionScope) => Promise<SavedPosition[]>;
  exportSavedPositions?: (scope?: SavedPositionScope) => Promise<{ yaml: string; target_names: string[] }>;
  listSavedPositions?: (scope?: SavedPositionScope) => Promise<SavedPosition[]>;
  saveSavedPosition?: (request: SavedPosition, scope?: SavedPositionScope) => Promise<SavedPosition>;
};

export type PositionLibraryState = {
  saved: SavedPosition[];
  exportYaml: string;
  notice: string;
  busy: boolean;
};

/** Serves position-op intents from position-library widgets over HTTP. */
export function usePositionLibrary(
  client: PositionLibraryClient | null | undefined,
  enabled: boolean,
  scope?: SavedPositionScope,
) {
  const [state, setState] = useState<PositionLibraryState>({ saved: [], exportYaml: "", notice: "", busy: false });
  const clientRef = useRef(client);
  clientRef.current = client;
  const savedRef = useRef<SavedPosition[]>([]);
  savedRef.current = state.saved;
  // A pose is a joint vector in one arm's order; the scope keeps Explorer's
  // poses out of Kinova's export.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scopeKey = `${scope?.configId ?? ""}:${scope?.appId ?? ""}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scope key reloads the list for another app; the effect reads it through a ref.
  useEffect(() => {
    const listSavedPositions = client?.listSavedPositions;
    if (!enabled || !listSavedPositions) {
      return;
    }
    let cancelled = false;
    listSavedPositions(scopeRef.current)
      .then((saved) => {
        if (!cancelled) {
          setState((current) => ({ ...current, saved }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((current) => ({ ...current, notice: describeError(error) }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, scopeKey]);

  const handleIntent = useCallback((intent: WidgetActionIntent): boolean => {
    if (intent.type !== "position-op") {
      return false;
    }
    const positionsClient = clientRef.current;
    const finish = (update: Partial<PositionLibraryState>) =>
      setState((current) => ({ ...current, busy: false, ...update }));
    setState((current) => ({ ...current, busy: true, notice: "" }));

    if (intent.op === "capture" && positionsClient?.saveSavedPosition && intent.jointNames && intent.positions) {
      const name = nextPoseName(savedRef.current);
      positionsClient
        .saveSavedPosition(
          {
            name,
            joint_names: [...intent.jointNames],
            positions: [...intent.positions],
            description: "",
          },
          scopeRef.current,
        )
        .then(() => positionsClient.listSavedPositions?.(scopeRef.current) ?? [])
        .then((saved) => finish({ saved, notice: `Captured ${name}.` }))
        .catch((error: unknown) => finish({ notice: describeError(error) }));
      return true;
    }

    if (intent.op === "delete" && positionsClient?.deleteSavedPosition && intent.name) {
      const name = intent.name;
      positionsClient
        .deleteSavedPosition(name, scopeRef.current)
        .then((saved) => finish({ saved, notice: `Deleted ${name}.` }))
        .catch((error: unknown) => finish({ notice: describeError(error) }));
      return true;
    }

    if (intent.op === "export" && positionsClient?.exportSavedPositions) {
      positionsClient
        .exportSavedPositions(scopeRef.current)
        .then((response) => finish({ exportYaml: response.yaml, notice: "Exported. Paste into the manager's params." }))
        .catch((error: unknown) => finish({ notice: describeError(error) }));
      return true;
    }

    finish({ notice: "This backend does not offer the position library." });
    return true;
  }, []);

  return { state, handleIntent };
}

function nextPoseName(saved: readonly SavedPosition[]): string {
  const taken = new Set(saved.map((pose) => pose.name));
  let index = 1;
  while (taken.has(`pose_${index}`)) {
    index += 1;
  }
  return `pose_${index}`;
}

function describeError(error: unknown): string {
  if (error instanceof BloomApiError) {
    try {
      const parsed = JSON.parse(error.responseText) as { detail?: unknown };
      if (typeof parsed.detail === "string") {
        return parsed.detail;
      }
    } catch {
      // fall through to the generic message
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Position request failed.";
}
