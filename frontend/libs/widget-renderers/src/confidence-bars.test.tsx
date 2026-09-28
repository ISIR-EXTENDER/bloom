/**
 * @vitest-environment jsdom
 */
import type { CommandStateEntry } from "@bloom/api-client";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { ConfidenceBarsWidget } from "./confidence-bars-renderer";
import type { WidgetRendererProps } from "./types";

function descriptor(settings: Record<string, unknown> = {}) {
  return {
    widget: {
      id: "bars",
      kind: "confidence-bars",
      title: "Goal confidence",
      layout: { x: 0, y: 0, width: 338, height: 160 },
      settings: { topic: "/shared_control/confidences", ...settings },
    },
  } as unknown as WidgetRendererProps["descriptor"];
}

const message = (values: number[], receivedAt = new Date().toISOString()) => ({
  receivedAt,
  topic: "/shared_control/confidences",
  value: { layout: { dim: [{ label: "agnostic,goal_0,goal_1" }] }, data: values },
});

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
});

function reportAssist(active: boolean) {
  const entry: CommandStateEntry = { value: active, source: "measured", by: "robot", revision: 1, updated_at: "" };
  act(() =>
    applyCommandStateMessage({ type: "command_state", revision: 1, snapshot: { "shared_control:active": entry } }),
  );
}

describe("the confidence bars", () => {
  it("draw one named bar per goal from the manager's label", () => {
    const { container } = render(
      <ConfidenceBarsWidget
        data={{ type: "topic-echo", messages: [message([0.1, 0.8, 0.3])] }}
        descriptor={descriptor()}
      />,
    );
    expect(container.firstElementChild?.getAttribute("data-live")).toBe("true");
    expect(container.firstElementChild?.getAttribute("data-goals")).toBe("3");
    const rows = [...container.querySelectorAll(".bloom-confidence-row")];
    expect(rows.map((row) => row.getAttribute("data-goal"))).toEqual(["agnostic", "goal_0", "goal_1"]);
    expect(rows.map((row) => row.getAttribute("data-confidence"))).toEqual(["0.10", "0.80", "0.30"]);
    expect(screen.getByText("no goal")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "no goal: 10%" })).toBeTruthy();
    expect(screen.getByRole("meter", { name: "goal_0: 80%" })).toBeTruthy();
  });

  it("says not publishing the moment the store measures Assist off, keeping no live bar", () => {
    reportAssist(false);
    const { container } = render(
      <ConfidenceBarsWidget data={{ type: "topic-echo", messages: [message([1, 0, 0])] }} descriptor={descriptor()} />,
    );
    expect(container.firstElementChild?.getAttribute("data-live")).toBe("false");
    expect(container.querySelectorAll(".bloom-confidence-row")).toHaveLength(0);
    expect(screen.getByText("not publishing")).toBeTruthy();
    expect(screen.getByText(/publishes it only while Assist is on/)).toBeTruthy();
  });

  it("draws six goals in a scrolling list, and formats the percentage for the locale", () => {
    reportAssist(true);
    const six = {
      receivedAt: new Date().toISOString(),
      topic: "/shared_control/confidences",
      value: { layout: { dim: [{ label: "agnostic,a,b,c,d,e" }] }, data: [0.1, 0.2, 0.3, 0.1, 0.2, 0.1] },
    };
    const { container } = render(
      <ConfidenceBarsWidget data={{ type: "topic-echo", messages: [six] }} descriptor={descriptor()} language="fr" />,
    );
    expect(container.querySelectorAll(".bloom-confidence-row")).toHaveLength(6);
    expect(container.querySelector(".bloom-confidence-list")?.className).toBe("bloom-confidence-list");
    // French spaces the sign the way Intl does; the visible name and the accessible one agree.
    const tenPercent = new Intl.NumberFormat("fr", { maximumFractionDigits: 0, style: "percent" }).format(0.1);
    expect(tenPercent).toMatch(/^10\s%$/);
    expect(screen.getByRole("meter", { name: `aucune cible: ${tenPercent}` })).toBeTruthy();
  });

  it("shows something sane for a malformed message", () => {
    reportAssist(true);
    const broken = { receivedAt: new Date().toISOString(), topic: "/shared_control/confidences", value: { data: "x" } };
    const { container } = render(
      <ConfidenceBarsWidget data={{ type: "topic-echo", messages: [broken] }} descriptor={descriptor()} />,
    );
    expect(container.firstElementChild?.getAttribute("data-live")).toBe("false");
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it("says the manager is not publishing when the topic is quiet, in the profile's language", () => {
    const stale = new Date(Date.now() - 10_000).toISOString();
    const { container } = render(
      <ConfidenceBarsWidget
        data={{ type: "topic-echo", messages: [message([1, 0, 0], stale)] }}
        descriptor={descriptor()}
        language="fr"
      />,
    );
    expect(container.firstElementChild?.getAttribute("data-live")).toBe("false");
    expect(screen.getByText("rien reçu")).toBeTruthy();
    expect(screen.getByText(/ne publie que pendant l'assistance/)).toBeTruthy();
  });
});
