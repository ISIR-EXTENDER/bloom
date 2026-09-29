import { BloomApiError, type SavedPosition, type SavedPositionScope } from "@bloom/api-client";
import { applyCommandStateMessage, resetCommandStateForTests } from "@bloom/widget-renderers";
import type { WidgetActionIntent } from "@bloom/widgets";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type PositionLibraryClient, usePositionLibrary } from "./use-position-library";

const pose = (name: string): SavedPosition => ({ name, joint_names: ["j1"], positions: [0.1], description: "" });

/** A backend that keeps its poses in memory, per scope, the way the real one keys them by application. */
function fakeBackend(initial: SavedPosition[] = []) {
  const byScope = new Map<string, SavedPosition[]>();
  const sent: { name: string; fingerprint: string; scope?: SavedPositionScope }[] = [];
  let cancels = 0;
  const key = (scope?: SavedPositionScope) => `${scope?.configId ?? ""}:${scope?.appId ?? ""}`;
  const list = (scope?: SavedPositionScope) => byScope.get(key(scope)) ?? initial;
  const client: Required<PositionLibraryClient> = {
    listSavedPositions: async (scope) => [...list(scope)],
    // Like the server: a name given is create-only, none given takes the next free pose_N.
    saveSavedPosition: async (request, scope) => {
      const current = list(scope);
      if (current.some((saved) => saved.name === request.name)) {
        throw new BloomApiError("Conflict", 409, JSON.stringify({ detail: `${request.name} already exists.` }));
      }
      let index = 1;
      while (current.some((saved) => saved.name === `pose_${index}`)) {
        index += 1;
      }
      const pose = { ...request, name: request.name ?? `pose_${index}` };
      byScope.set(key(scope), [...current, pose]);
      return pose;
    },
    cancelGoTo: async () => {
      cancels += 1;
      return { detail: "passthrough" };
    },
    deleteSavedPosition: async (name, scope) => {
      const next = list(scope).filter((saved) => saved.name !== name);
      byScope.set(key(scope), next);
      return next;
    },
    renameSavedPosition: async (name, newName, scope) => {
      const current = list(scope);
      if (current.some((saved) => saved.name === newName)) {
        throw new BloomApiError("Conflict", 409, JSON.stringify({ detail: `'${newName}' already exists` }));
      }
      const next = current.map((saved) => (saved.name === name ? { ...saved, name: newName } : saved));
      byScope.set(key(scope), next);
      return next;
    },
    goToSavedPosition: async (name, fingerprint, scope) => {
      const target = list(scope).find((saved) => saved.name === name);
      if (!target?.ee_pose) {
        throw new BloomApiError("Unprocessable", 422, JSON.stringify({ detail: `'${name}' has no hand pose` }));
      }
      sent.push({ name, fingerprint, scope });
      return { name, topic: "/pose_target", status: "published", detail: "published" };
    },
    exportSavedPositions: async (scope) => ({
      yaml: `joint_targets:\n${list(scope)
        .map((saved) => `  ${saved.name}: [${saved.positions.join(", ")}]`)
        .join("\n")}`,
      target_names: list(scope).map((saved) => saved.name),
    }),
  };
  return { byScope, client, sent, cancels: () => cancels };
}

const HAND = {
  frame_id: "base_link",
  position: [0.6, 0.27, 0.22],
  orientation: [0, 0, 0, 1],
  fingerprint: "fp1",
} as SavedPosition["ee_pose"];
const reachable = (name: string): SavedPosition => ({ ...pose(name), ee_pose: HAND });
const op = (fields: Partial<Extract<WidgetActionIntent, { type: "position-op" }>>): WidgetActionIntent => ({
  type: "position-op",
  op: "go",
  widgetId: "lib",
  widgetKind: "position-library",
  ...fields,
});

afterEach(() => resetCommandStateForTests());

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

    let handled: unknown = null;
    act(() => {
      handled = result.current.handleIntent(capture([0.5, -0.2], ["j1", "j2"]));
    });
    expect(handled).toEqual({ accepted: true });
    expect(result.current.state.busy).toBe(true);
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.event).toEqual({ kind: "saved", name: "pose_2" });
    expect(result.current.state.notice).toBe("");
    expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["pose_1", "pose_3", "pose_2"]);
    expect(backend.byScope.get("cfg:explorer")?.at(-1)).toMatchObject({
      joint_names: ["j1", "j2"],
      positions: [0.5, -0.2],
    });
  });

  it("names the backend's own reason when a save is refused", async () => {
    const client: PositionLibraryClient = {
      listSavedPositions: async () => [pose("pose_1")],
      saveSavedPosition: async () => {
        throw new BloomApiError(
          "Conflict",
          409,
          JSON.stringify({ detail: "The arm is not where it was commanded (in contact or lagging)." }),
        );
      },
    };
    const { result } = renderHook(() => usePositionLibrary(client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));

    act(() => {
      result.current.handleIntent(capture());
    });
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.notice).toBe("The arm is not where it was commanded (in contact or lagging).");
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
    expect(result.current.state.event).toEqual({ kind: "deleted", name: "home" });
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
    expect(result.current.state.event).toEqual({ kind: "exported" });
  });

  it("says so when the backend has no position library, and leaves other intents alone", async () => {
    const { result } = renderHook(() => usePositionLibrary({}, true, scope));
    let handled: unknown = true;
    act(() => {
      handled = result.current.handleIntent({
        type: "command",
        widgetId: "w",
        widgetKind: "button",
        purpose: "stop",
      } as unknown as WidgetActionIntent);
    });
    expect(handled).toBeNull();
    expect(result.current.state.notice).toBe("");

    act(() => {
      handled = result.current.handleIntent(capture());
    });
    expect(handled).toMatchObject({ accepted: false });
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

  it("saves the hand pose with the joints, the way the backend keys it", async () => {
    const backend = fakeBackend();
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    act(() => {
      result.current.handleIntent({
        ...capture([0.5], ["j1"]),
        eePose: { frameId: "base_link", position: [0.6, 0.27, 0.22], orientation: [0, 0, 0, 1] },
      } as WidgetActionIntent);
    });
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));
    expect(backend.byScope.get("cfg:explorer")?.[0]).toMatchObject({
      name: "pose_1",
      ee_pose: { frame_id: "base_link", position: [0.6, 0.27, 0.22], orientation: [0, 0, 0, 1] },
    });
  });

  it("renames a pose and shows the list the backend kept, or the backend's reason", async () => {
    const backend = fakeBackend([pose("pose_1"), pose("home")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(2));

    act(() => {
      result.current.handleIntent(op({ op: "rename", name: "pose_1", newName: "pick_up" }));
    });
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["pick_up", "home"]);
    expect(result.current.state.event).toEqual({ kind: "renamed", name: "pick_up" });

    act(() => {
      result.current.handleIntent(op({ op: "rename", name: "pick_up", newName: "home" }));
    });
    await waitFor(() => expect(result.current.state.busy).toBe(false));
    expect(result.current.state.notice).toBe("'home' already exists");
  });

  it("previews the pose an armed Go to would send, and clears it", async () => {
    const backend = fakeBackend([reachable("pose_1")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));

    act(() => {
      result.current.handleIntent(op({ op: "preview", name: "pose_1" }));
    });
    expect(result.current.state.armed?.ee_pose).toEqual(HAND);
    act(() => {
      result.current.handleIntent(op({ op: "preview" }));
    });
    expect(result.current.state.armed).toBeNull();
    expect(backend.sent).toEqual([]);
  });

  it("drops the preview when the library leaves the screen", async () => {
    const backend = fakeBackend([reachable("pose_1")]);
    const { result, rerender } = renderHook(({ enabled }) => usePositionLibrary(backend.client, enabled, scope), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));
    act(() => {
      result.current.handleIntent(op({ op: "preview", name: "pose_1" }));
    });
    rerender({ enabled: false });
    expect(result.current.state.armed).toBeNull();
  });

  it("sends a Go to by name, and remembers the store revision it was pressed at", async () => {
    const backend = fakeBackend([reachable("pose_1")]);
    act(() => applyCommandStateMessage({ type: "command_state", revision: 41, snapshot: {} }));
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleIntent(op({ name: "pose_1", fingerprint: "fp1" }));
    });
    expect(outcome).toEqual({ accepted: true, status: "accepted" });
    expect(backend.sent).toEqual([{ name: "pose_1", fingerprint: "fp1", scope }]);
    expect(result.current.state.sent).toEqual({ name: "pose_1", revision: 41 });
    expect(result.current.state.busy).toBe(false);
  });

  it("reports a refused Go to with the backend's reason and keeps no send", async () => {
    const backend = fakeBackend([pose("pose_1")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleIntent(op({ name: "pose_1", fingerprint: "fp1" }));
    });
    expect(outcome).toEqual({ accepted: false, detail: "'pose_1' has no hand pose" });
    expect(result.current.state.notice).toBe("'pose_1' has no hand pose");
    expect(result.current.state.sent).toBeNull();
  });

  it("does not count a simulated Go to as sent", async () => {
    const client: PositionLibraryClient = {
      listSavedPositions: async () => [reachable("pose_1")],
      goToSavedPosition: async (name) => ({ name, topic: "/pose_target", status: "simulated", detail: "No ROS node." }),
    };
    const { result } = renderHook(() => usePositionLibrary(client, true, scope));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleIntent(op({ name: "pose_1", fingerprint: "fp1" }));
    });
    expect(outcome).toMatchObject({ accepted: false, detail: "No ROS node." });
    expect(result.current.state.sent).toBeNull();
  });

  it("says so when the backend cannot send a saved pose", async () => {
    const { result } = renderHook(() => usePositionLibrary({}, true, scope));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleIntent(op({ name: "pose_1" }));
    });
    expect(outcome).toMatchObject({ accepted: false });
    expect(result.current.state.notice).toBe("This backend cannot send a saved pose.");
  });

  it("records a Go to whose reply never came as sent, unconfirmed", async () => {
    const client: PositionLibraryClient = {
      listSavedPositions: async () => [reachable("pose_1")],
      goToSavedPosition: async () => {
        throw new Error("Go to pose_1 timed out after 4 s.");
      },
    };
    act(() => applyCommandStateMessage({ type: "command_state", revision: 7, snapshot: {} }));
    const { result } = renderHook(() => usePositionLibrary(client, true, scope));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.handleIntent(op({ name: "pose_1", fingerprint: "fp1" }));
    });
    expect(outcome).toMatchObject({ accepted: false, status: "unknown" });
    expect(result.current.state.sent).toEqual({ name: "pose_1", revision: 7, unconfirmed: true });
    expect(result.current.state.notice).toBe("");
  });

  it("cancels a Go to through the backend, and says why when it cannot", async () => {
    const backend = fakeBackend([reachable("pose_1")]);
    const { result } = renderHook(() => usePositionLibrary(backend.client, true, scope));
    await act(async () => {
      await result.current.handleIntent(op({ op: "cancel" }));
    });
    expect(backend.cancels()).toBe(1);

    const failing = renderHook(() =>
      usePositionLibrary(
        {
          cancelGoTo: async () => {
            throw new BloomApiError("Down", 503, JSON.stringify({ detail: "No publisher." }));
          },
        },
        true,
        scope,
      ),
    );
    await act(async () => {
      await failing.result.current.handleIntent(op({ op: "cancel" }));
    });
    expect(failing.result.current.state.notice).toBe("No publisher.");
  });

  it("reloads the list when control changes hands and when the tablet comes back to the front", async () => {
    const backend = fakeBackend([pose("home")]);
    const { result, rerender } = renderHook(({ owner }) => usePositionLibrary(backend.client, true, scope, owner), {
      initialProps: { owner: false },
    });
    await waitFor(() => expect(result.current.state.saved).toHaveLength(1));
    backend.byScope.set("cfg:explorer", [pose("home"), pose("park")]);
    rerender({ owner: true });
    await waitFor(() => expect(result.current.state.saved).toHaveLength(2));

    backend.byScope.set("cfg:explorer", [pose("park")]);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.state.saved.map((saved) => saved.name)).toEqual(["park"]));
    expect(result.current.state.scope).toEqual(scope);
  });

  it("keeps a refusal the gate answered until it is cleared", () => {
    const { result } = renderHook(() => usePositionLibrary({}, false, scope));
    act(() => result.current.setNotice("STOPPED"));
    expect(result.current.state.notice).toBe("STOPPED");
    act(() => result.current.setNotice(""));
    expect(result.current.state.notice).toBe("");
  });
});
