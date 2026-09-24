export const WIDGET_LAYOUT_GRID_SIZE = 8;

export function snapLayoutValue(value: number, gridSize: number = WIDGET_LAYOUT_GRID_SIZE): number {
  if (gridSize <= 0) {
    return value;
  }
  return Math.round(value / gridSize) * gridSize;
}
