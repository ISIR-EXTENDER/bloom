/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlotWidget } from "./display-renderers";
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
