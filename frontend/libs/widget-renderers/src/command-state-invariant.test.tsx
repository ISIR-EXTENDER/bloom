/**
 * @vitest-environment jsdom
 */
import type { CommandStateEntry, CommandStateSource, ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommandStateMessage, clearCommandState, resetCommandStateForTests } from "./command-state";
import { renderScreenWidgets } from "./index";
import type { WidgetActionOutcome } from "./types";

// ADR 0142's screen invariant: whatever the server pushes and however replies go, every control renders the store
// (or "sending" within 3 s of its own press), and controls on one key agree.

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  vi.useRealTimers();
});

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SELF = "me0000000000";
const LAMP = "/ui/lamp";
const SHAPING = "manager:shaping";
const layout = { x: 0, y: 0, width: 240, height: 120 };
const lamp = (id: string) => ({
  id,
  kind: "toggle" as const,
  title: id,
  layout,
  settings: {
    topic: LAMP,
    messageType: "std_msgs/msg/Bool",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
    onLabel: "On",
    offLabel: "Off",
  },
});
const modeButton = (id: string, mode: string) => ({
  id,
  kind: "command-button" as const,
  title: id,
  layout,
  settings: { topic: "/mode_request", messageType: "std_msgs/msg/String", payload: { data: mode } },
});
const snakeToggle = {
  id: "snake-toggle",
  kind: "toggle" as const,
  title: "snake-toggle",
  layout,
  settings: {
    topic: "/mode_request",
    messageType: "std_msgs/msg/String",
    onPayload: "{data: 'geometric/snake'}",
    offPayload: "{data: 'geometric/both'}",
  },
};
const WIDGETS = [
  lamp("lamp-a"),
  lamp("lamp-b"),
  modeButton("jaco-a", "geometric/jaco"),
  modeButton("jaco-b", "geometric/jaco"),
  modeButton("both", "geometric/both"),
  snakeToggle,
];

type Expected = "off" | "on" | "other" | "selected" | "unknown" | "unselected";

/** The reference: what a control on this key must show for this snapshot, written apart from the renderer. */
function expectedFor(widgetId: string, snapshot: Record<string, CommandStateEntry>): Expected {
  const lampEntry = snapshot[LAMP];
  const shaping = snapshot[SHAPING];
  const known = (entry: CommandStateEntry | undefined) => entry !== undefined && entry.source !== "unknown";
  if (widgetId.startsWith("lamp")) {
    if (!known(lampEntry)) return "unknown";
    const data = (lampEntry?.value as { data?: unknown } | null)?.data;
    return data === true ? "on" : data === false ? "off" : "other";
  }
  if (!known(shaping)) return "unknown";
  if (widgetId === "snake-toggle") {
    return shaping?.value === "geometric/snake" ? "on" : shaping?.value === "geometric/both" ? "off" : "other";
  }
  const mode = widgetId === "both" ? "geometric/both" : "geometric/jaco";
  return shaping?.value === mode ? "selected" : "unselected";
}

const VALUES: Record<string, unknown[]> = {
  [LAMP]: [{ data: true }, { data: false }, { data: "odd" }],
  [SHAPING]: ["geometric/both", "geometric/jaco", "geometric/snake"],
};
const SOURCES: CommandStateSource[] = ["measured", "commanded", "reset", "unknown"];
const BYS = [SELF, "robot", "server", "other-publisher", "abcdefabcdef"];

async function runSeed(seed: number, steps: number) {
  const random = mulberry32(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  vi.useFakeTimers();
  let now = 0;
  vi.setSystemTime(now);

  // The server's own record and the messages it has sent, so an old one can arrive late.
  let serverRevision = 0;
  const server: Record<string, CommandStateEntry> = {};
  const sent: { revision: number; snapshot: Record<string, CommandStateEntry> }[] = [];
  // What the screen holds by the rules: newest revision since the last clear.
  let model: { revision: number; snapshot: Record<string, CommandStateEntry> } | null = null;
  const owed: { key: string; value: unknown }[] = [];
  const pressedAt = new Map<string, number>();

  const serverWrite = (key: string, value: unknown, source: CommandStateSource, by: string) => {
    serverRevision += 1;
    server[key] = { value: source === "unknown" ? null : value, source, by, revision: serverRevision, updated_at: "" };
  };
  const deliver = (message: { revision: number; snapshot: Record<string, CommandStateEntry> }) => {
    act(() => applyCommandStateMessage({ type: "command_state", self: SELF, ...message }));
    if (model === null || message.revision >= model.revision) {
      model = message;
    }
  };
  const push = () => {
    const message = { revision: serverRevision, snapshot: structuredClone(server) };
    sent.push(message);
    deliver(message);
  };

  const onActionIntent = vi.fn((sentIntent: WidgetActionIntent): Promise<WidgetActionOutcome> => {
    const intent = sentIntent as { payload?: unknown; topic?: string };
    const reply = pick(["accepted", "accepted", "refused", "lost", "never"] as const);
    if (reply === "accepted" || reply === "lost") {
      const text = typeof intent.payload === "string" ? intent.payload : JSON.stringify(intent.payload);
      if (intent.topic === LAMP) {
        owed.push({ key: LAMP, value: { data: text.includes("true") } });
      } else {
        const mode = /geometric\/(both|jaco|snake)/.exec(text)?.[0];
        if (mode) owed.push({ key: SHAPING, value: mode });
      }
    }
    if (reply === "never") return new Promise(() => undefined);
    return Promise.resolve(
      reply === "accepted"
        ? { accepted: true }
        : reply === "refused"
          ? { accepted: false, detail: "Refused." }
          : { accepted: false, status: "unknown" as const },
    );
  });
  const descriptors = renderScreenDescriptors(
    {
      id: "s",
      title: "S",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: WIDGETS,
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  const { container } = render(<div>{renderScreenWidgets(descriptors, { onActionIntent })}</div>);
  const rendered = (widgetId: string) =>
    container
      .querySelector(`article[aria-label^="${widgetId} "] [data-command-state]`)
      ?.getAttribute("data-command-state") ?? null;

  for (let step = 0; step < steps; step += 1) {
    const roll = random();
    if (roll < 0.3) {
      const key = pick([LAMP, SHAPING]);
      serverWrite(key, pick(VALUES[key] ?? []), pick(SOURCES), pick(BYS));
      push();
    } else if (roll < 0.4 && owed.length > 0) {
      const { key, value } = owed.splice(Math.floor(random() * owed.length), 1)[0] as { key: string; value: unknown };
      serverWrite(key, value, "commanded", SELF);
      push();
    } else if (roll < 0.47 && sent.length > 1) {
      deliver(pick(sent.slice(0, -1)));
    } else if (roll < 0.52) {
      act(() => clearCommandState());
      model = null;
      if (random() < 0.3) {
        // A backend restart: revisions start again.
        serverRevision = 0;
        for (const key of Object.keys(server)) delete server[key];
        sent.length = 0;
      }
      push();
    } else if (roll < 0.8) {
      const widget = pick(WIDGETS);
      const button = container.querySelector<HTMLButtonElement>(`article[aria-label^="${widget.id} "] button`);
      if (button) {
        await act(async () => {
          fireEvent.click(button);
        });
        pressedAt.set(widget.id, now);
      }
    } else {
      const ms = Math.floor(random() * 2000);
      now += ms;
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    }
    await act(async () => {});

    const snapshot: Record<string, CommandStateEntry> =
      (model as { snapshot: Record<string, CommandStateEntry> } | null)?.snapshot ?? {};
    const shown = new Map<string, string | null>();
    for (const widget of WIDGETS) {
      const state = rendered(widget.id);
      shown.set(widget.id, state);
      const context = `seed ${seed} step ${step} ${widget.id}`;
      if (state === "sending") {
        const at = pressedAt.get(widget.id);
        expect(at, context).toBeDefined();
        expect(now - (at ?? -Infinity), context).toBeLessThan(3000);
        continue;
      }
      expect(state, context).toBe(expectedFor(widget.id, snapshot));
    }
    for (const [a, b] of [
      ["lamp-a", "lamp-b"],
      ["jaco-a", "jaco-b"],
    ]) {
      const left = shown.get(a as string);
      const right = shown.get(b as string);
      if (left !== "sending" && right !== "sending") {
        expect(left, `seed ${seed} step ${step}: ${a} and ${b} agree`).toBe(right);
      }
    }
  }
}

describe("every control renders the store", () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    "holds for seeded run %i",
    async (seed) => {
      await runSeed(seed * 7919, 160);
    },
    30000,
  );
});
