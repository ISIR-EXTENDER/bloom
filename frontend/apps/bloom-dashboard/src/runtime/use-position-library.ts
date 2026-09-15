import { BloomApiError, type SavedPosition } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState } from "react";

export type PositionLibraryClient = {
  deleteSavedPosition?: (name: string) => Promise<SavedPosition[]>;
  exportSavedPositions?: () => Promise<{ yaml: string; target_names: string[] }>;
  listSavedPositions?: () => Promise<SavedPosition[]>;
  saveSavedPosition?: (request: SavedPosition) => Promise<SavedPosition>;
};

export type PositionLibraryState = {
  saved: SavedPosition[];
  exportYaml: string;
  notice: string;
  busy: boolean;
};

/** Serves position-op intents from position-library widgets over HTTP. */
export function usePositionLibrary(client: PositionLibraryClient | null | undefined, enabled: boolean) {
  const [state, setState] = useState<PositionLibraryState>({ saved: [], exportYaml: "", notice: "", busy: false });
  const clientRef = useRef(client);
  clientRef.current = client;
  const savedRef = useRef<SavedPosition[]>([]);
  savedRef.current = state.saved;

  useEffect(() => {
    const listSavedPositions = client?.listSavedPositions;
    if (!enabled || !listSavedPositions) {
      return;
    }
    let cancelled = false;
    listSavedPositions()
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
  }, [client, enabled]);

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
        .saveSavedPosition({
          name,
          joint_names: [...intent.jointNames],
          positions: [...intent.positions],
          description: "",
        })
        .then(() => positionsClient.listSavedPositions?.() ?? [])
        .then((saved) => finish({ saved, notice: `Captured ${name}.` }))
        .catch((error: unknown) => finish({ notice: describeError(error) }));
      return true;
    }

    if (intent.op === "delete" && positionsClient?.deleteSavedPosition && intent.name) {
      const name = intent.name;
      positionsClient
        .deleteSavedPosition(name)
        .then((saved) => finish({ saved, notice: `Deleted ${name}.` }))
        .catch((error: unknown) => finish({ notice: describeError(error) }));
      return true;
    }

    if (intent.op === "export" && positionsClient?.exportSavedPositions) {
      positionsClient
        .exportSavedPositions()
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
  while (taken.has(`pose-${index}`)) {
    index += 1;
  }
  return `pose-${index}`;
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
