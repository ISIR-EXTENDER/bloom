import { BloomApiError, type SavedPosition, type SavedPositionScope } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type PositionLibraryClient, usePositionLibrary } from "./use-position-library";

const pose = (name: string): SavedPosition => ({ name, joint_names: ["j1"], positions: [0.1], description: "" });

/** A backend that keeps its poses in memory, per scope, the way the real one keys them by application. */
function fakeBackend(initial: SavedPosition[] = []) {
  const byScope = new Map<string, SavedPosition[]>();
  const key = (scope?: SavedPositionScope) => `${scope?.configId ?? ""}:${scope?.appId ?? ""}`;
  const list = (scope?: SavedPositionScope) => byScope.get(key(scope)) ?? initial;
  const client: Required<PositionLibraryClient> = {
    listSavedPositions: async (scope) => [...list(scope)],
    saveSavedPosition: async (request, scope) => {
      const current = list(scope);
      if (current.some((saved) => saved.name === request.name)) {
        throw new BloomApiError("Conflict", 409, JSON.stringify({ detail: `${request.name} already exists.` }));
      }
      byScope.set(key(scope), [...current, request]);
      return request;
    },
    deleteSavedPosition: async (name, scope) => {
      const next = list(scope).filter((saved) => saved.name !== name);
      byScope.set(key(scope), next);
      return next;
    },
    exportSavedPositions: async (scope) => ({
      yaml: `joint_targets:\n${list(scope)
        .map((saved) => `  ${saved.name}: [${saved.positions.join(", ")}]`)
        .join("\n")}`,
      target_names: list(scope).map((saved) => saved.name),
    }),
  };
  return { byScope, client };
}

const capture = (positions = [0.5], jointNames = ["j1"]): WidgetActionIntent => ({
  type: "position-op",
  op: "capture",
  widgetId: "lib",
  widgetKind: "position-library",
  jointNames,
  positions,
});

const scope = { appId: "explorer", configId: "cfg" };

describe("the position library", () => {
  it("loads the saved poses of the application it is scoped to, and reloads for another", async () => {
    const backend = fakeBackend();
    backend.byScope.set("cfg:explorer", [pose("home")]);
    backend.byScope.set("cfg:kinova", [pose("park"), pose("retract")]);
    const { result, rerender } = renderHook(
      ({ appId }) => usePositionLibrary(backend.client, true, { appId, configId: "cfg" }),
      { initialProps: { appId: "explorer" } },
    );
    await waitFor(() => expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["home"]));
    rerender({ appId: "kinova" });
    await waitFor(() => expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["park", "retract"]));
  });

  it("does not ask the backend while no position-library widget is on screen", async () => {
    const backend = fakeBackend([pose("home")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, false, scope));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.saved).toEqual([]);
  });

  it("captures under the next free pose name, skipping names already taken", async () => {
    const backend = fakeBackend([pose("pose_1"), pose("pose_3")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(2));

    let handled = false;
    act(() => {
      handled = result.current.handleIntent(capture([0.5, -0.2], ["j1", "j2"]));
    });
    expect(handled).toBe(true);
    expect(result.current.state.busy).toBe(true);
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.notice).toBe("Captured pose_2.");
    expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["pose_1", "pose_3", "pose_2"]);
    expect(backend.byScope.get("cfg:explorer")?.at(-1)).toMatchObject({
      joint_names: ["j1", "j2"],
      positions: [0.5, -0.2],
    });
  });

  it("names the backend's own reason when a capture collides or fails", async () => {
    const backend = fakeBackend([pose("pose_1")]);
    // The list the hook holds is stale: another tablet saved pose_2 since.
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));
    backend.byScope.set("cfg:explorer", [pose("pose_1"), pose("pose_2")]);

    act(() => {
      result.current.handleIntent(capture());
    });
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.notice).toBe("pose_2 already exists.");
    expect(result.current.state.saved).toHaveLength(1);
  });

  it("falls back to the error's message when the response is not JSON, and to a generic line for a thrown value", async () => {
    const client: PositionLibraryClient = {
      listSavedPositions: async () => [],
      deleteSavedPosition: async () => {
        throw new BloomApiError("Gateway timeout", 504, "<html>");
      },
      exportSavedPositions: async () => {
        throw "offline";
      },
      saveSavedPosition: async () => {
        throw new Error("Network down");
      },
    };
    const { result } = renderHook(() => usePositionLibrary(client, true, scope));
    const notices: string[] = [];
    for (const intent of [
      { type: "position-op", op: "delete", widgetId: "lib", widgetKind: "position-library", name: "home" },
      { type: "position-op", op: "export", widgetId: "lib", widgetKind: "position-library" },
      capture(),
    ] as WidgetActionIntent[]) {
      act(() => {
        result.current.handleIntent(intent);
      });
      await waitFor(() => expect(result.current.state.busy).toBe(false));
      notices.push(result.current.state.notice);
    }
    expect(notices).toEqual(["Gateway timeout", "Position request failed.", "Network down"]);
  });

  it("reports a list that could not be loaded without losing the widget", async () => {
    const client: PositionLibraryClient = {
      listSavedPositions: async () => {
        throw new BloomApiError("Forbidden", 403, JSON.stringify({ detail: "Operators cannot read poses." }));
      },
    };
    const { result } = renderHook(() => usePositionLibrary(client, true, scope));
    await waitFor(() => expect(result.current.state.notice).toBe("Operators cannot read poses."));
    expect(result.current.state.saved).toEqual([]);
  });

  it("deletes a pose and shows the list the backend kept", async () => {
    const backend = fakeBackend([pose("home"), pose("park")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(2));
    act(() => {
      result.current.handleIntent({
        type: "position-op",
        op: "delete",
        widgetId: "lib",
        widgetKind: "position-library",
        name: "home",
      });
    });
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["park"]);
    expect(result.current.state.notice).toBe("Deleted home.");
  });

  it("exports the manager's joint-target block for the poses in scope", async () => {
    const backend = fakeBackend([pose("home")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    act(() => {
      result.current.handleIntent({
        type: "position-op",
        op: "export",
        widgetId: "lib",
        widgetKind: "position-library",
      });
    });
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.exportYaml).toBe("joint_targets:\n  home: [0.1]");
    expect(result.current.state.notice).toBe("Exported. Paste into the manager's params.");
  });

  it("says so when the backend has no position library, and leaves other intents alone", async () => {
    const { result } = renderHook(() => usePositionLibrary({}, true, scope));
    let handled = true;
    act(() => {
      handled = result.current.handleIntent({
        type: "command",
        widgetId: "w",
        widgetKind: "button",
        purpose: "stop",
      } as unknown as WidgetActionIntent);
    });
    expect(handled).toBe(false);
    expect(result.current.state.notice).toBe("");

    act(() => {
      handled = result.current.handleIntent(capture());
    });
    expect(handled).toBe(true);
    expect(result.current.state).toMatchObject({
      busy: false,
      notice: "This backend does not offer the position library.",
    });

    // A capture with no joint state to save is refused the same way, even on a full client.
    const { result: full } = renderHook(() => usePositionLibrary(fakeBackend().client, true, scope));
    act(() => {
      full.current.handleIntent({
        type: "position-op",
        op: "capture",
        widgetId: "lib",
        widgetKind: "position-library",
      });
    });
    expect(full.current.state.notice).toBe("This backend does not offer the position library.");
  });
});
