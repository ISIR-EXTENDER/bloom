export type PlotBounds = {
  max: number;
  min: number;
};

export type PlotBar = {
  key: string;
  rect: {
    height: number;
    rx: number;
    width: number;
    x: number;
    y: number;
  };
};

export function createSparklinePath(
  values: readonly number[],
  width: number,
  height: number,
  bounds: PlotBounds,
): string {
  if (values.length === 0) {
    return `M0 ${height}`;
  }

  const range = bounds.max - bounds.min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - bounds.min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function createPlotBars(
  values: readonly number[],
  width: number,
  height: number,
  bounds: PlotBounds,
): PlotBar[] {
  if (values.length === 0) {
    return [];
  }

  const range = bounds.max - bounds.min || 1;
  const gap = Math.min(6, width / values.length / 3);
  const barWidth = Math.max(2, width / values.length - gap);

  return values.map((value, index) => {
    const normalized = Math.max(0, Math.min(1, (value - bounds.min) / range));
    const barHeight = Math.max(2, normalized * height);
    const x = index * (width / values.length) + gap / 2;
    const y = height - barHeight;

    return {
      key: `${index}-${value}`,
      rect: {
        height: Number(barHeight.toFixed(2)),
        rx: 3,
        width: Number(barWidth.toFixed(2)),
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      },
    };
  });
}

export function resolvePlotBounds(
  values: readonly number[],
  configuredMin: number | undefined,
  configuredMax: number | undefined,
): PlotBounds {
  if (values.length === 0) {
    return { max: configuredMax ?? 1, min: configuredMin ?? 0 };
  }

  const min = configuredMin ?? Math.min(...values);
  const max = configuredMax ?? Math.max(...values);

  return max > min ? { max, min } : { max: min + 1, min };
}

export function formatPlotNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
