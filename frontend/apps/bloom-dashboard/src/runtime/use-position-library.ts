import {
  BloomApiError,
  type PoseTargetResponse,
  type SavedPosition,
  type SavedPositionRequest,
  type SavedPositionScope,
} from "@bloom/api-client";
import { getCommandStateRevision, type WidgetActionOutcome } from "@bloom/widget-renderers";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PositionLibraryClient = {
  cancelGoTo?: () => Promise<{ detail: string }>;
  deleteSavedPosition?: (name: string, scope?: SavedPositionScope) => Promise<SavedPosition[]>;
  exportSavedPositions?: (scope?: SavedPositionScope) => Promise<{ yaml: string; target_names: string[] }>;
  goToSavedPosition?: (name: string, fingerprint: string, scope?: SavedPositionScope) => Promise<PoseTargetResponse>;
  listSavedPositions?: (scope?: SavedPositionScope) => Promise<SavedPosition[]>;
  renameSavedPosition?: (name: string, newName: string, scope?: SavedPositionScope) => Promise<SavedPosition[]>;
  saveSavedPosition?: (request: SavedPositionRequest, scope?: SavedPositionScope) => Promise<SavedPosition>;
};

export type PositionLibraryEventKind = "deleted" | "exported" | "renamed" | "saved";

export type PositionLibraryState = {
  saved: SavedPosition[];
  exportYaml: string;
  /** A refusal or failure, in the backend's words; a success is an `event` the widget words itself. */
  notice: string;
  event: { kind: PositionLibraryEventKind; name?: string } | null;
  busy: boolean;
  /** The pose an armed Go to would send: a 3D view on the screen previews it. */
  armed: SavedPosition | null;
  /**
   * The last Go to this tablet sent, and the command-state revision at the press: later reports answer it.
   * Unconfirmed when its reply never came.
   */
  sent: { name: string; revision: number; unconfirmed?: boolean } | null;
  /** The app these poses belong to; the widget picks its Go to out of the server's record by it. */
  scope?: SavedPositionScope;
};

const INITIAL: PositionLibraryState = {
  saved: [],
  exportYaml: "",
  notice: "",
  event: null,
  busy: false,
  armed: null,
  sent: null,
};

/**
 * Serves position-op intents from position-library widgets over HTTP. The list reloads when the library comes on
 * screen, when the tablet comes back to the front, and when `refreshKey` changes (control changing hands).
 */
export function usePositionLibrary(
  client: PositionLibraryClient | null | undefined,
  enabled: boolean,
  scope?: SavedPositionScope,
  refreshKey?: unknown,
) {
  const [state, setState] = useState<PositionLibraryState>(INITIAL);
  const clientRef = useRef(client);
  clientRef.current = client;
  const savedRef = useRef<SavedPosition[]>([]);
  savedRef.current = state.saved;
  // A pose is a joint vector in one arm's order; the scope keeps Explorer's
  // poses out of Kinova's export.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scopeKey = `${scope?.configId ?? ""}:${scope?.appId ?? ""}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scope key and refresh key reload the list; the effect reads the scope through a ref.
  useEffect(() => {
    const listSavedPositions = client?.listSavedPositions;
    if (!enabled || !listSavedPositions) {
      return;
    }
    let cancelled = false;
    const load = () =>
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
    void load();
    // Another tablet may have saved, renamed or deleted meanwhile.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, enabled, scopeKey, refreshKey]);

  // Leaving the screen, or the app, leaves nothing armed to preview.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new scope is another app, whose preview this is not.
  useEffect(() => {
    if (!enabled) {
      setState((current) => (current.armed ? { ...current, armed: null } : current));
    }
    return () => setState((current) => (current.armed ? { ...current, armed: null } : current));
  }, [enabled, scopeKey]);

  /** Null when the intent is not a position op; otherwise what became of it. */
  const handleIntent = useCallback(
    (intent: WidgetActionIntent): WidgetActionOutcome | Promise<WidgetActionOutcome> | null => {
      if (intent.type !== "position-op") {
        return null;
      }
      const positionsClient = clientRef.current;
      if (intent.op === "preview") {
        const armed = intent.name ? (savedRef.current.find((pose) => pose.name === intent.name) ?? null) : null;
        setState((current) => (current.armed === armed ? current : { ...current, armed }));
        return { accepted: true };
      }
      if (intent.op === "go") {
        return goTo(positionsClient, intent.name, intent.fingerprint, scopeRef.current, setState);
      }
      if (intent.op === "cancel") {
        return cancelGoTo(positionsClient, setState);
      }

      const finish = (update: Partial<PositionLibraryState>) =>
        setState((current) => ({ ...current, busy: false, ...update }));
      setState((current) => ({ ...current, busy: true, notice: "", event: null }));
      const fail = (error: unknown) => finish({ notice: describeError(error) });

      if (intent.op === "capture" && positionsClient?.saveSavedPosition && intent.jointNames && intent.positions) {
        const hand = intent.eePose;
        let savedName = "";
        // The server names it: the next free pose_N, chosen where two tablets cannot both take it.
        positionsClient
          .saveSavedPosition(
            {
              joint_names: [...intent.jointNames],
              positions: [...intent.positions],
              description: "",
              ...(hand
                ? {
                    ee_pose: {
                      frame_id: hand.frameId,
                      position: [...hand.position],
                      orientation: [...hand.orientation],
                    },
                  }
                : {}),
            },
            scopeRef.current,
          )
          .then((pose) => {
            savedName = pose.name;
            return positionsClient.listSavedPositions?.(scopeRef.current) ?? [];
          })
          .then((saved) => finish({ saved, event: { kind: "saved", name: savedName } }))
          .catch(fail);
        return { accepted: true };
      }

      if (intent.op === "delete" && positionsClient?.deleteSavedPosition && intent.name) {
        const name = intent.name;
        positionsClient
          .deleteSavedPosition(name, scopeRef.current)
          .then((saved) => finish({ saved, event: { kind: "deleted", name } }))
          .catch(fail);
        return { accepted: true };
      }

      if (intent.op === "rename" && positionsClient?.renameSavedPosition && intent.name && intent.newName) {
        const newName = intent.newName;
        positionsClient
          .renameSavedPosition(intent.name, newName, scopeRef.current)
          .then((saved) => finish({ saved, event: { kind: "renamed", name: newName } }))
          .catch(fail);
        return { accepted: true };
      }

      if (intent.op === "export" && positionsClient?.exportSavedPositions) {
        positionsClient
          .exportSavedPositions(scopeRef.current)
          .then((response) => finish({ exportYaml: response.yaml, event: { kind: "exported" } }))
          .catch(fail);
        return { accepted: true };
      }

      finish({ notice: "This backend does not offer the position library." });
      return { accepted: false, detail: "This backend does not offer the position library." };
    },
    [],
  );

  /** A refusal the runtime's gate answered before the library saw the press; cleared on Resume. */
  const setNotice = useCallback((notice: string) => setState((current) => ({ ...current, notice })), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scope key names the scope; the object is rebuilt per render.
  const scoped = useMemo(() => ({ ...state, scope: scopeRef.current }), [state, scopeKey]);
  return { state: scoped, handleIntent, setNotice };
}

async function cancelGoTo(
  client: PositionLibraryClient | null | undefined,
  setState: (update: (current: PositionLibraryState) => PositionLibraryState) => void,
): Promise<WidgetActionOutcome> {
  if (!client?.cancelGoTo) {
    return { accepted: false, detail: "This backend cannot cancel a Go to." };
  }
  try {
    await client.cancelGoTo();
    return { accepted: true };
  } catch (error: unknown) {
    const detail = describeError(error);
    setState((current) => ({ ...current, notice: detail }));
    return { accepted: false, detail };
  }
}

/**
 * A robot command: the backend sends the saved hand pose to the manager's pose target, as the owner, refused
 * while stopped. The revision is read before the send, so any report written after it answers this Go to.
 */
async function goTo(
  client: PositionLibraryClient | null | undefined,
  name: string | undefined,
  fingerprint: string | undefined,
  scope: SavedPositionScope | undefined,
  setState: (update: (current: PositionLibraryState) => PositionLibraryState) => void,
): Promise<WidgetActionOutcome> {
  if (!client?.goToSavedPosition || !name || !fingerprint) {
    const detail = "This backend cannot send a saved pose.";
    setState((current) => ({ ...current, notice: detail }));
    return { accepted: false, detail };
  }
  const revision = getCommandStateRevision();
  setState((current) => ({ ...current, armed: null, busy: true, notice: "", event: null }));
  try {
    const response = await client.goToSavedPosition(name, fingerprint, scope);
    const simulated = response.status === "simulated";
    setState((current) => ({
      ...current,
      busy: false,
      sent: simulated ? current.sent : { name, revision },
      notice: simulated ? response.detail : "",
    }));
    return simulated
      ? { accepted: false, detail: response.detail, status: "refused" }
      : { accepted: true, status: "accepted" };
  } catch (error: unknown) {
    if (!(error instanceof BloomApiError)) {
      // No reply: it may have gone. The server's record, if it sent, still says what became of it.
      setState((current) => ({ ...current, busy: false, sent: { name, revision, unconfirmed: true } }));
      return { accepted: false, detail: describeError(error), status: "unknown" };
    }
    const detail = describeError(error);
    setState((current) => ({ ...current, busy: false, notice: detail }));
    return { accepted: false, detail };
  }
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
