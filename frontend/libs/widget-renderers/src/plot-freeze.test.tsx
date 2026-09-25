/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TopicDebugWidget } from "./debug-renderers";
import { PlotWidget } from "./display-renderers";
import { createSparklinePath, resolvePlotBounds } from "./plot-rendering";
import type { WidgetRendererProps } from "./types";

/**
 * A transient is unreadable on a live trace: by the time an operator has seen a
 * spike it has scrolled off. Freezing holds what was on screen.
 */
function renderPlot(samples: number[], settings: Record<string, unknown> = {}) {
  const descriptor = {
    widget: {
      id: "velocity",
      kind: "topic-plot",
      title: "Velocity",
      settings: { unit: "m/s", ...settings },
    },
  } as unknown as WidgetRendererProps["descriptor"];

  const data = {
    type: "plot" as const,
    samples: samples.map((value, index) => ({ value, timestamp: `t${index}` })),
  };

  const view = render(<PlotWidget data={data} descriptor={descriptor} />);
  return { view, descriptor, data };
}

describe("plot freeze", () => {
  afterEach(cleanup);

  it("offers a freeze control by default", () => {
    renderPlot([1, 2, 3]);

    expect(screen.getByRole("button", { name: "Freeze" })).toBeTruthy();
  });

  it("can be turned off for a display-only screen", () => {
    renderPlot([1, 2, 3], { allow_freeze: false });

    expect(screen.queryByRole("button", { name: "Freeze" })).toBeNull();
  });

  it("holds the samples that were on screen when pressed", () => {
    const { view, descriptor } = renderPlot([1, 2, 3]);

    fireEvent.click(screen.getByRole("button", { name: "Freeze" }));

    // New samples arrive while frozen.
    view.rerender(
      <PlotWidget
        data={{ type: "plot", samples: [9, 9, 9].map((value, index) => ({ value, timestamp: `t${index}` })) }}
        descriptor={descriptor}
      />,
    );

    expect(screen.getByRole("button", { name: "Live" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("frozen");
    expect(screen.getByRole("status").textContent).toContain("3");
  });

  it("returns to the live trace when unfrozen", () => {
    const { view, descriptor } = renderPlot([1, 2, 3]);

    fireEvent.click(screen.getByRole("button", { name: "Freeze" }));
    view.rerender(
      <PlotWidget
        data={{ type: "plot", samples: [9, 9, 9].map((value, index) => ({ value, timestamp: `t${index}` })) }}
        descriptor={descriptor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(screen.getByRole("status").textContent).toContain("latest");
    expect(screen.getByRole("status").textContent).toContain("9");
  });
});

describe("a sample outside the configured bounds", () => {
  // Drawn unclamped it lands outside the viewBox and is clipped away, so an overspeed excursion vanishes
  // from the trace while the readout still shows it. The bars variant already railed it at the edge.
  it("is railed at the edge of the plot rather than clipped out of it", () => {
    const path = createSparklinePath([0.2, 0.5, 2.5, 0.4], 220, 82, { max: 1, min: 0 });

    const ys = [...path.matchAll(/[ML][\d.]+ (-?[\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(82);
  });
});

describe("the echo's header note", () => {
  // Every TwistStamped carries a frame, so showing the frame alone meant the echo never showed an age:
  // a command sent ten minutes ago read exactly like the one just sent.
  it("carries the age beside the frame", () => {
    render(
      <TopicDebugWidget
        controlState={{ commandFrameId: "base_link" }}
        data={{
          type: "topic-echo",
          messages: [
            {
              receivedAt: new Date(Date.now() - 600_000).toISOString(),
              topic: "/tablet_cartesian_command",
              value: { twist: { linear: { x: 0.4 } } },
            },
          ],
        }}
        descriptor={
          {
            widget: {
              id: "sent",
              kind: "topic-echo",
              title: "What was sent",
              layout: { x: 0, y: 0, width: 400, height: 200 },
              settings: {},
            },
          } as never
        }
      />,
    );

    const note = screen.getByText(/base_link/);
    expect(note.textContent).toContain("base_link");
    expect(note.textContent).toContain("10 min ago");
  });
});

describe("a very long sample series", () => {
  // maxSamples is validated with a floor and no ceiling, and spreading the array into Math.min threw
  // RangeError past about a hundred thousand values, taking the view down with it.
  it("finds its bounds without spreading the array", () => {
    const values = Array.from({ length: 200_000 }, (_, index) => index / 1000);

    const bounds = resolvePlotBounds(values, undefined, undefined);

    expect(bounds.min).toBe(0);
    expect(bounds.max).toBeCloseTo(199.999, 3);
  });
});
