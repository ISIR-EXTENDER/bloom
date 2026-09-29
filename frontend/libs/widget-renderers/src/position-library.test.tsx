/**
 * @vitest-environment jsdom
 */
import type { CommandStateEntry, RuntimeLanguage, ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { PositionLibraryWidget } from "./position-library-renderer";
import type { WidgetActionOutcome, WidgetDataSnapshot } from "./types";

type LibrarySnapshot = Extract<WidgetDataSnapshot, { type: "position-library" }>;

function libraryScreen(settings: Record<string, unknown> = {}): ScreenConfig {
  return {
    id: "positions",
    title: "Positions",
    canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    widgets: [
      {
        id: "positions-library",
        kind: "position-library",
        title: "Saved poses",
        layout: { x: 0, y: 0, width: 902, height: 420 },
        settings: {
          jointStateTopic: "/joint_states",
          jointNames: ["joint_1", "joint_2"],
          show_details: false,
          ...settings,
        },
      },
    ],
  };
}

const OPERATOR = { editable: false, go_to: true, eePoseTopic: "/ee_pose" };
const HAND = { frameId: "base_link", position: [0.6, 0.27, 0.22], orientation: [0, 0, 0, 1] } as const;

/** Saving promises "the robot's current pose", so a live snapshot has to carry a current timestamp. */
const now = () => new Date().toISOString();
const liveJoints = () => ({ joints: { names: ["joint_1", "joint_2"], positions: [0.5, -1.2], receivedAt: now() } });
const liveHand = (position: readonly [number, number, number] = HAND.position) => ({
  eePose: { ...HAND, position, receivedAt: now() },
});
const staleJoints = {
  joints: {
    names: ["joint_1", "joint_2"],
    positions: [0.5, -1.2],
    receivedAt: new Date(Date.now() - 600_000).toISOString(),
  },
};
const savedPose = (name: string, hand: typeof HAND | null = HAND, verified = true) => ({
  name,
  jointNames: ["joint_1", "joint_2"],
  positions: [0.5, -1.2],
  eePose: hand ? { ...hand, verified, fingerprint: `fp-${name}` } : null,
});
const SCOPE = { configId: "cfg", appId: "app" };

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome> | undefined;

function renderLibrary(
  data?: Partial<LibrarySnapshot>,
  options: {
    settings?: Record<string, unknown>;
    handler?: Handler;
    language?: RuntimeLanguage;
    disabled?: boolean;
  } = {},
) {
  const descriptor = renderScreenDescriptors(libraryScreen(options.settings), createDefaultWidgetRegistry())[0];
  if (descriptor?.status !== "resolved") throw new Error("Missing descriptor.");
  const onActionIntent = vi.fn<Handler>(options.handler ?? (() => ({ accepted: true })));
  const view = (neutralRevision = 0) => (
    <PositionLibraryWidget
      controlState={options.disabled ? { disabled: true } : undefined}
      data={data ? { type: "position-library", saved: [], ...data } : undefined}
      descriptor={descriptor}
      language={options.language}
      neutralRevision={neutralRevision}
      onActionIntent={onActionIntent}
    />
  );
  const rendered = render(view());
  return { onActionIntent, rerender: (neutralRevision: number) => rendered.rerender(view(neutralRevision)), rendered };
}

type PositionOp = Extract<WidgetActionIntent, { type: "position-op" }>;
const intentsOf = (spy: ReturnType<typeof vi.fn<Handler>>, op: string): PositionOp[] =>
  spy.mock.calls
    .map(([intent]) => intent)
    .filter((intent): intent is PositionOp => intent.type === "position-op" && intent.op === op);

let revision = 0;
/** What the server writes as it follows a Go to: `positions:go`. */
function reportGoTo(record: Record<string, unknown>, source: CommandStateEntry["source"] = "measured") {
  revision += 1;
  const value = { name: "pose_1", config_id: "cfg", app_id: "app", ...record };
  act(() =>
    applyCommandStateMessage({
      type: "command_state",
      revision,
      snapshot: { "positions:go": { value, source, by: "server", updated_at: now(), revision } },
    }),
  );
}

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  revision = 0;
});

describe("saving a pose", () => {
  it("cannot save before a joint state has arrived", () => {
    const { onActionIntent } = renderLibrary();

    const save = screen.getByRole("button", { name: "Save the robot's current pose" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(intentsOf(onActionIntent, "capture")).toEqual([]);
    expect(screen.getByText("Waiting for joint states before saving.")).toBeTruthy();
  });

  it("saves the live joints, and the live hand pose when the library names a hand topic", () => {
    const { onActionIntent } = renderLibrary({ ...liveJoints(), ...liveHand() }, { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Save the robot's current pose" }));

    expect(intentsOf(onActionIntent, "capture")).toEqual([
      {
        type: "position-op",
        op: "capture",
        widgetId: "positions-library",
        widgetKind: "position-library",
        jointNames: ["joint_1", "joint_2"],
        positions: [0.5, -1.2],
        eePose: { frameId: "base_link", position: [0.6, 0.27, 0.22], orientation: [0, 0, 0, 1] },
      },
    ]);
  });

  it("waits for the hand pose it promises to save, and says which topic it waits on", () => {
    const { onActionIntent } = renderLibrary(liveJoints(), { settings: OPERATOR });

    const save = screen.getByRole("button", { name: "Save the robot's current pose" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(save);
    expect(intentsOf(onActionIntent, "capture")).toEqual([]);
    expect(screen.getByText("Waiting for the hand pose on /ee_pose before saving.")).toBeTruthy();
  });

  it("refuses to save from a joint stream that stopped", () => {
    // Saved from a stale snapshot, a pose records where the arm was, under a name someone later drives to.
    const { onActionIntent } = renderLibrary(staleJoints);

    const save = screen.getByRole("button", { name: "Save the robot's current pose" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(save);
    expect(intentsOf(onActionIntent, "capture")).toEqual([]);
  });

  it("names the pose it saved, in the operator's words and language", () => {
    renderLibrary({ event: { kind: "saved", name: "pose_3" } }, { settings: OPERATOR, language: "fr" });

    expect(screen.getByRole("status").textContent).toBe("Enregistrée sous Pose 3.");
  });
});

describe("the bench's tools", () => {
  it("lists saved poses by their stored name and exports only when there is something to export", () => {
    const { onActionIntent } = renderLibrary({ ...liveJoints(), saved: [savedPose("pose_1")] });

    expect(screen.getByText("pose_1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export saved poses as manager parameters" }));
    expect(intentsOf(onActionIntent, "export")).toHaveLength(1);
  });

  it("shows the exported parameters and says what the export is for", () => {
    renderLibrary({ ...liveJoints(), saved: [], exportYaml: "joint_targets:\n  joint_names:" });

    expect(screen.getByLabelText("Manager joint-target parameters").textContent).toContain("joint_targets:");
    expect(screen.getByText(/only through this export and a manager restart; Go to needs neither/)).toBeTruthy();
  });

  it("renames a pose to a name the manager can reach, and refuses one it cannot", () => {
    const { onActionIntent } = renderLibrary({ saved: [savedPose("pose_1")] });

    fireEvent.click(screen.getByRole("button", { name: "Rename pose_1" }));
    const field = screen.getByRole("textbox", { name: "New name for pose_1" });
    fireEvent.change(field, { target: { value: "pick up?" } });
    expect(screen.getByRole("button", { name: "Save name" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Use a–z, 0–9 and _ only, up to 64 characters.")).toBeTruthy();

    fireEvent.change(field, { target: { value: "Pick up" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(intentsOf(onActionIntent, "rename")).toEqual([
      expect.objectContaining({ name: "pose_1", newName: "pick_up" }),
    ]);
  });

  it("lets a rename be abandoned, and sends nothing for an unchanged name", () => {
    const { onActionIntent } = renderLibrary({ saved: [savedPose("pose_1")] });

    fireEvent.click(screen.getByRole("button", { name: "Rename pose_1" }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rename pose_1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename pose_1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(intentsOf(onActionIntent, "rename")).toEqual([]);
  });

  it("says what it renamed, deleted and exported", () => {
    const view = renderLibrary({ event: { kind: "renamed", name: "pick_up" } });
    expect(screen.getByRole("status").textContent).toBe("Renamed to pick_up.");
    view.rendered.unmount();
    renderLibrary({ event: { kind: "exported" } }, { language: "es" });
    expect(screen.getByRole("status").textContent).toBe(
      "Exportado. Péguelo en los parámetros del gestor y reinícielo.",
    );
  });
});

describe("deleting a saved pose", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const saved = { saved: [savedPose("pose-1")] };

  it("takes two taps, so a stray touch cannot destroy a pose", () => {
    const { onActionIntent } = renderLibrary(saved);
    const remove = screen.getByRole("button", { name: "Delete saved pose pose-1" });

    fireEvent.click(remove);
    expect(intentsOf(onActionIntent, "delete")).toEqual([]);
    expect(screen.getByRole("button", { name: "Confirm deleting pose-1" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting pose-1" }));
    expect(intentsOf(onActionIntent, "delete")).toEqual([expect.objectContaining({ name: "pose-1" })]);
  });

  it("disarms on its own instead of staying primed", () => {
    const { onActionIntent } = renderLibrary(saved);

    fireEvent.click(screen.getByRole("button", { name: "Delete saved pose pose-1" }));
    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.getByRole("button", { name: "Delete saved pose pose-1" })).toBeTruthy();
    expect(intentsOf(onActionIntent, "delete")).toEqual([]);
  });
});

describe("Go to a saved pose", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const operatorPoses = () => ({ ...liveJoints(), ...liveHand(), saved: [savedPose("pose_1"), savedPose("home")] });

  it("shows the operator a name to read and where the hand was, with nothing to rename or delete", () => {
    renderLibrary(operatorPoses(), { settings: OPERATOR });

    expect(screen.getByText("Pose 1")).toBeTruthy();
    expect(screen.getAllByText("x 0.60 · y 0.27 · z 0.22 m")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Go to Pose 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to Home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Delete|Rename|Export/ })).toBeNull();
  });

  it("arms on the first press, previews the pose, and sends on the second", () => {
    const { onActionIntent } = renderLibrary(operatorPoses(), { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
    expect(intentsOf(onActionIntent, "preview").at(-1)).toMatchObject({ name: "pose_1" });
    const armed = screen.getByRole("button", { name: "Press again to send the arm to Pose 1" });
    expect(armed.getAttribute("data-armed")).toBe("true");
    expect(armed.textContent).toBe("Press again to go");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(armed);
    expect(intentsOf(onActionIntent, "go")).toEqual([
      {
        type: "position-op",
        op: "go",
        widgetId: "positions-library",
        widgetKind: "position-library",
        name: "pose_1",
        fingerprint: "fp-pose_1",
      },
    ]);
    expect(intentsOf(onActionIntent, "preview").at(-1)?.name).toBeUndefined();
  });

  it("takes a second press inside the settle for the same gesture, not a decision", () => {
    const { onActionIntent } = renderLibrary(operatorPoses(), { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Press again to send the arm to Pose 1" }));
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
  });

  it("arms one pose at a time: arming another disarms the first", () => {
    const { onActionIntent } = renderLibrary(operatorPoses(), { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(screen.getByRole("button", { name: "Go to Pose 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Press again to send the arm to Home" })).toBeTruthy();
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
  });

  it("disarms by itself after five seconds", () => {
    const { onActionIntent } = renderLibrary(operatorPoses(), { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
    expect(screen.getByRole("button", { name: "Press again to send the arm to Pose 1" })).toBeTruthy();
  });

  it("is disarmed by STOP, and the preview goes with it", () => {
    const { onActionIntent, rerender } = renderLibrary(operatorPoses(), { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    rerender(1);
    expect(screen.getByRole("button", { name: "Go to Pose 1" }).getAttribute("data-armed")).toBeNull();
    expect(intentsOf(onActionIntent, "preview").at(-1)?.name).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
  });

  it("clears its preview when the screen is left while armed", () => {
    const { onActionIntent, rendered } = renderLibrary(operatorPoses(), { settings: OPERATOR });

    fireEvent.click(screen.getByRole("button", { name: "Go to Pose 1" }));
    rendered.unmount();
    expect(intentsOf(onActionIntent, "preview").at(-1)?.name).toBeUndefined();
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
  });

  it("goes inert with the control, and never sends while disabled", () => {
    const { onActionIntent } = renderLibrary(operatorPoses(), { settings: OPERATOR, disabled: true });

    const go = screen.getByRole("button", { name: "Go to Pose 1" });
    expect(go).toHaveProperty("disabled", true);
    fireEvent.click(go);
    fireEvent.click(go);
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
  });

  it("cannot go to a pose saved without the hand's pose, and says why", () => {
    renderLibrary({ ...operatorPoses(), saved: [savedPose("pose_1", null)] }, { settings: OPERATOR });

    const go = screen.getByRole("button", { name: /^Go to Pose 1: Saved without the hand's pose/ });
    expect(go).toHaveProperty("disabled", true);
  });

  it("sends nothing while Enter is held: a repeat is not a second decision", () => {
    const { onActionIntent } = renderLibrary(operatorPoses(), { settings: OPERATOR });
    const go = screen.getByRole("button", { name: "Go to Pose 1" });

    // The browser clicks on each keydown it lets through, the first and every auto-repeat.
    const keyDown = (repeat: boolean) => {
      const target = screen.getByRole("button", { name: /Pose 1$/ });
      if (fireEvent.keyDown(target, { key: "Enter", repeat })) {
        fireEvent.click(target);
      }
    };
    keyDown(false);
    for (let elapsed = 0; elapsed < 1500; elapsed += 50) {
      act(() => {
        vi.advanceTimersByTime(50);
      });
      keyDown(true);
    }
    expect(intentsOf(onActionIntent, "go")).toEqual([]);
    expect(go.isConnected).toBe(true);
  });

  it("marks a pose the measured tip did not confirm when it was saved", () => {
    renderLibrary({ ...operatorPoses(), saved: [savedPose("pose_1", HAND, false)] }, { settings: OPERATOR });

    const mark = screen.getByText("not verified");
    expect(mark.getAttribute("title")).toMatch(/measured tip was not available/);
  });

  it("speaks the operator's language", () => {
    renderLibrary(operatorPoses(), { settings: OPERATOR, language: "es" });

    expect(screen.getByRole("button", { name: "Ir a Pose 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar la pose actual del robot" }).textContent).toBe(
      "Guardar esta pose",
    );
  });
});

describe("what a Go to is doing", () => {
  const progress = () => document.querySelector(".bloom-position-progress");
  const progressText = () => document.querySelector(".bloom-position-progress-text");
  const library = (extra: Partial<LibrarySnapshot> = {}) =>
    renderLibrary({ saved: [savedPose("pose_1")], scope: SCOPE, ...extra }, { settings: OPERATOR });

  it("says it was asked until the server's record answers, then what the manager reports, with a Cancel", () => {
    const { onActionIntent } = library({ sent: { name: "pose_1", revision: 0 } });
    expect(progressText()?.textContent).toMatch(/^Going to Pose 1 · last asked/);

    reportGoTo({ state: "moving", offset_mm: 100, offset_deg: 0, measured: true });
    expect(progress()?.getAttribute("data-state")).toBe("moving");
    expect(progressText()?.textContent).toContain(
      "Moving to Pose 1 · reported by the robot · measured tip 100 mm and 0° from it",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel the pose" }));
    expect(intentsOf(onActionIntent, "cancel")).toHaveLength(1);
  });

  it("says the tip is within tolerance on the measured pose, and offers no Cancel once it ended", () => {
    library();
    reportGoTo({ state: "arrived", offset_mm: 4, offset_deg: 0, measured: true });

    expect(progressText()?.textContent).toBe("Within tolerance of Pose 1 · measured tip 4 mm and 0° from it");
    expect(screen.queryByRole("button", { name: "Cancel the pose" })).toBeNull();
  });

  it("names the commanded pose when the tip could not be measured", () => {
    library();
    reportGoTo({ state: "stopped", offset_mm: 200, offset_deg: 0, measured: false }, "commanded");

    expect(progress()?.getAttribute("data-state")).toBe("stopped");
    expect(progressText()?.textContent).toBe(
      "Stopped before Pose 1 · commanded pose 200 mm and 0° from it, tip not measured",
    );
  });

  it("says the server gave up on a pose the arm could not reach, and the pad drives again", () => {
    library();
    reportGoTo({ state: "unreachable", offset_mm: 120, offset_deg: 3, measured: true });

    expect(progressText()?.textContent).toMatch(/^Could not reach Pose 1; the pad drives again/);
  });

  it("keeps an unconfirmed send cancellable, and ignores a record older than the press", () => {
    reportGoTo({ state: "arrived", offset_mm: 1, offset_deg: 0 });
    library({ sent: { name: "pose_1", revision, unconfirmed: true } });

    expect(progressText()?.textContent).toBe("Go to Pose 1 sent, not confirmed: the manager's status will say");
    expect(screen.getByRole("button", { name: "Cancel the pose" })).toBeTruthy();
  });

  it("ignores another app's Go to", () => {
    library();
    reportGoTo({ app_id: "other", state: "moving" });

    expect(progress()).toBeNull();
  });

  it("keeps the pose being gone to from the bench's delete and rename", () => {
    renderLibrary({ saved: [savedPose("pose_1"), savedPose("pose_2")], scope: SCOPE }, { settings: { go_to: true } });
    reportGoTo({ state: "moving" });

    expect(screen.getByRole("button", { name: "Delete saved pose pose_1" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Rename pose_1" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Delete saved pose pose_2" })).toHaveProperty("disabled", false);
  });

  it("reads Cancel in the seed's own words, in the operator's language", () => {
    renderLibrary(
      { saved: [savedPose("pose_1")], scope: SCOPE, sent: { name: "pose_1", revision: 0 } },
      { settings: OPERATOR, language: "fr" },
    );
    expect(screen.getByRole("button", { name: "Annuler la pose" })).toBeTruthy();
  });
});

describe("a pick-only library", () => {
  it("lists poses with their joint values and offers no editing", () => {
    renderLibrary({ saved: [savedPose("pose-1")] }, { settings: { editable: false } });

    expect(screen.getByText("0.50 -1.20")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
