import { normalizeWidgetSettings } from "@bloom/widgets";
import type { CSSProperties } from "react";
import { getBooleanSetting, getNumberSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

const DEFAULT_PLOT_VALUES = [0.18, 0.34, 0.28, 0.52, 0.47, 0.68, 0.61, 0.79, 0.73, 0.88];

export function GaugeWidget({ descriptor }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", 0);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  const value = clamp(getNumberSetting(descriptor.widget.settings, "value", min), min, max);
  const unit = getStringSetting(descriptor.widget.settings, "unit", "");
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div className="bloom-gauge-widget">
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{unit || "Gauge"}</span>
      </header>
      <meter
        aria-label={`${descriptor.widget.title}: ${formatNumber(value)}${unit ? ` ${unit}` : ""}`}
        className="sr-only"
        max={max}
        min={min}
        value={value}
      >
        {formatNumber(value)}
      </meter>
      <div
        aria-hidden="true"
        className="bloom-gauge-meter"
        style={{ "--bloom-gauge-percent": `${percent}%` } as CSSProperties}
      >
        <span>{formatNumber(value)}</span>
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="bloom-gauge-scale" aria-hidden="true">
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}

export function PlotWidget({ descriptor }: WidgetRendererProps) {
  const showLegend = getBooleanSetting(descriptor.widget.settings, "showLegend", true);
  const historySeconds = getNumberSetting(descriptor.widget.settings, "historySeconds", 10);
  const values = readNumberArraySetting(descriptor.widget.settings.samples) ?? DEFAULT_PLOT_VALUES;
  const path = createSparklinePath(values, 220, 82);
  const latestValue = values.at(-1) ?? 0;

  return (
    <div className="bloom-plot-widget">
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        {showLegend ? <span>{historySeconds}s history</span> : null}
      </header>
      <svg aria-label={`${descriptor.widget.title} plot`} className="bloom-plot-sparkline" viewBox="0 0 220 82">
        <title>{descriptor.widget.title}</title>
        <path className="bloom-plot-gridline" d="M0 20 H220 M0 41 H220 M0 62 H220" />
        <path className="bloom-plot-area" d={`${path} L220 82 L0 82 Z`} />
        <path className="bloom-plot-line" d={path} />
      </svg>
      <output className="bloom-plot-readout" aria-live="polite">
        latest {formatNumber(latestValue)}
      </output>
    </div>
  );
}

export function Robot3dWidget({ descriptor }: WidgetRendererProps) {
  const normalizedSettings = normalizeWidgetSettings("robot-3d", descriptor.widget.settings);
  const settings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  const jointStateTopic = getStringSetting(settings, "jointStateTopic", "/joint_states");
  const description = getStringSetting(settings, "description", "3D robot visualization extension point.");
  const showAxes = getBooleanSetting(settings, "showAxes", true);

  return (
    <div className="bloom-robot-3d-widget">
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{jointStateTopic}</span>
      </header>
      <div className="bloom-robot-3d-stage" aria-label={`${descriptor.widget.title} placeholder`} role="img">
        {showAxes ? (
          <div className="bloom-robot-3d-axes" aria-hidden="true">
            <span data-axis="x">X</span>
            <span data-axis="y">Y</span>
            <span data-axis="z">Z</span>
          </div>
        ) : null}
        <div className="bloom-robot-3d-arm" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <p>{description}</p>
    </div>
  );
}

function createSparklinePath(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) {
    return `M0 ${height}`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function readNumberArraySetting(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const values = value.filter(
    (candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate),
  );
  return values.length > 0 ? values : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
