/** Every joystick pad number derives from its edge length S (docs/design/pad-recipe.md). */
export type PadGeometry = {
  size: number;
  inset: number;
  labelWidth: number;
  gap: number;
  lineHeight: number;
  block: number;
  topInset: number;
  ring: number;
  deadzone: number;
  knob: number;
  travel: number;
};

const PAD_INSET = 8;
const PAD_LABEL_WIDTH = 64;
const PAD_GAP = 12;
const PAD_LINE_HEIGHT = 20;

export function padGeometry(size: number, deadzone = 0.2): PadGeometry {
  const block = PAD_INSET + PAD_LABEL_WIDTH;
  const ring = Math.max(0, size - 2 * (block + PAD_GAP));
  return {
    size,
    inset: PAD_INSET,
    labelWidth: PAD_LABEL_WIDTH,
    gap: PAD_GAP,
    lineHeight: PAD_LINE_HEIGHT,
    block,
    topInset: block - PAD_LINE_HEIGHT,
    ring,
    deadzone: Math.round(ring * deadzone),
    knob: Math.round(size * 0.26),
    travel: Math.round(size * 0.37),
  };
}

/** The tablet bench rail every bench screen reserves (docs/design/README.md). */
export const BENCH_RAIL = {
  stage: { x: 14, right: 916 },
  rail: { x: 928, right: 1266 },
  stop: { x: 928, y: 410, width: 338, height: 252 },
} as const;
