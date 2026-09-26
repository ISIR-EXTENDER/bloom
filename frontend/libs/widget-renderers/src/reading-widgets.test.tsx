/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraWidget } from "./camera-renderer";
import { JacobianWidget } from "./debug-table-renderers";
import { EventLogWidget, GaugeWidget, PlotWidget } from "./display-renderers";
import { ValueStripWidget } from "./plot-board-renderer";
import { PositionLibraryWidget } from "./position-library-renderer";
import type { WidgetRendererProps } from "./types";

function descriptor(kind: string, title: string, settings: Record<string, unknown> = {}) {
  return {
    widget: { id: kind, kind, title, layout: { x: 0, y: 0, width: 400, height: 300 }, settings },
  } as unknown as WidgetRendererProps["descriptor"];
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the gauge", () => {
  it("prints the real value past its range and clamps only the fill", () => {
    const { container } = render(
      <GaugeWidget
        data={{ type: "gauge", receivedAt: new Date().toISOString(), topic: "/joint", value: 2.3 }}
        descriptor={descriptor("gauge", "Joint 1", { unit: "rad" })}
      />,
    );
    const meter = container.querySelector(".bloom-gauge-meter") as HTMLElement;
    expect(meter.textContent).toContain("2.3");
    expect(meter.style.getPropertyValue("--bloom-gauge-percent")).toBe("100%");
    expect(screen.getByRole("meter").getAttribute("aria-label")).toBe("Joint 1: 2.3 rad");
  });

  it("speaks the profile's language", () => {
    render(<GaugeWidget descriptor={descriptor("gauge", "Batterie")} language="fr" />);
    expect(screen.getByText("Jauge")).toBeTruthy();
    expect(screen.getByText("aucune source")).toBeTruthy();
  });
});

describe("the Jacobian", () => {
  const matrix = Array.from({ length: 36 }, (_, index) => (index % 7 === 0 ? 1 : 0));

  it("marks a matrix that stopped arriving as stale", () => {
    vi.useFakeTimers();
    const { container } = render(
      <JacobianWidget
        data={{
          type: "topic-echo",
          messages: [{ receivedAt: new Date().toISOString(), topic: "/ee_jac", value: { data: matrix } }],
        }}
        descriptor={descriptor("jacobian", "Jacobian", { topic: "/ee_jac" })}
      />,
    );
    expect(container.querySelector(".bloom-jacobian")?.getAttribute("data-stale")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.querySelector(".bloom-jacobian")?.getAttribute("data-stale")).toBe("true");
    expect(screen.getByText(/· stale/)).toBeTruthy();
  });
});

describe("the plot", () => {
  const plotData = (value: number) => ({
    type: "plot" as const,
    samples: [
      { timestamp: "t0", value: 0.1 },
      { timestamp: "t1", value },
    ],
  });

  it("announces the reading once it settles, not on every batch", () => {
    vi.useFakeTimers();
    const plot = descriptor("plot", "Speed");
    const { container, rerender } = render(<PlotWidget data={plotData(0.2)} descriptor={plot} />);
    const region = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(container.querySelector(".bloom-plot-readout")?.hasAttribute("aria-live")).toBe(false);
    for (const value of [0.3, 0.4, 0.5]) {
      rerender(<PlotWidget data={plotData(value)} descriptor={plot} />);
      act(() => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(region.textContent).toBe("Speed: latest 0.2");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(region.textContent).toBe("Speed: latest 0.5");
  });

  it("speaks the profile's language", () => {
    render(<PlotWidget data={plotData(0.5)} descriptor={descriptor("plot", "Vitesse")} language="es" />);
    expect(screen.getByText("2 muestras")).toBeTruthy();
    expect(screen.getByText("último valor 0.5")).toBeTruthy();
    expect(screen.getByLabelText("Gráfica: Vitesse")).toBeTruthy();
  });
});

describe("the event log", () => {
  it("speaks the profile's language, ages included", () => {
    render(
      <EventLogWidget
        data={{
          type: "event-log",
          messages: [{ receivedAt: new Date().toISOString(), topic: "/rosout", value: { level: 20 } }],
        }}
        descriptor={descriptor("event-log", "Journal")}
        language="fr"
      />,
    );
    expect(screen.getByText("Événement reçu")).toBeTruthy();
    expect(screen.getByText("1 événement")).toBeTruthy();
    expect(screen.getByText("il y a 0 s")).toBeTruthy();
  });

  it("ages a live event from its arrival here, not from the backend's stamp", () => {
    vi.useFakeTimers();
    // Quiet first, then a stream advancing with this clock: a backend of its own, not old events from the last.
    vi.advanceTimersByTime(5000);
    const skewedAt = () => new Date(Date.now() - 3_600_000 * 5).toISOString();
    const first = { receivedAt: skewedAt(), topic: "/rosout", value: "hello" };
    const { rerender } = render(
      <EventLogWidget data={{ type: "event-log", messages: [first] }} descriptor={descriptor("event-log", "Log")} />,
    );
    vi.advanceTimersByTime(100);
    const next = { receivedAt: skewedAt(), topic: "/rosout", value: "again" };
    rerender(
      <EventLogWidget
        data={{ type: "event-log", messages: [first, next] }}
        descriptor={descriptor("event-log", "Log")}
      />,
    );
    expect(screen.getByText("0 s ago")).toBeTruthy();
  });
});

describe("the camera and the value strip", () => {
  it("label a camera in the profile's language", () => {
    render(<CameraWidget descriptor={descriptor("camera", "Pince", { source: "ros-topic" })} language="fr" />);
    expect(screen.getByText("Aucun topic")).toBeTruthy();
    expect(screen.getByText("Topic requis")).toBeTruthy();
  });

  it("mark a stale value in the profile's language", () => {
    const series = [
      {
        key: "a",
        label: "Height",
        topic: "/ee_pose",
        fieldPath: "pose.position.z",
        unit: "m",
        enabled: true,
        emphasis: false,
        rampIndex: 0,
        samples: [{ time: Date.now() - 10_000, value: 0.25 }],
      },
    ];
    render(
      <ValueStripWidget
        data={{ type: "plot-series", series } as never}
        descriptor={descriptor("value-strip", "Valores")}
        language="es"
      />,
    );
    expect(screen.getByText("desactualizado")).toBeTruthy();
  });
});

describe("a pick-only position library", () => {
  it("says its poses are for reference, and offers nothing that looks like it would send one", () => {
    render(
      <PositionLibraryWidget
        data={{
          type: "position-library",
          saved: [{ name: "home", jointNames: ["joint_1"], positions: [0] }],
        }}
        descriptor={descriptor("position-library", "Saved poses", { editable: false })}
      />,
    );
    expect(screen.getByRole("list", { name: "Saved poses, for reference only" })).toBeTruthy();
    expect(screen.getByText(/this list cannot send a pose/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
