/**
 * Where a control's body sits inside its card. The renderer draws from these, and the minimum-size
 * contract measures from them, so a target the builder reports is the one the hand meets.
 */

export type TitlePlacement = "above" | "overlay";

export type JoystickControlSizeOptions = {
  placement?: TitlePlacement;
  showDetails?: boolean;
};

/** The pad edge inside its 2 px surface border; `above` spends 32 px on the title row. */
export function resolveJoystickControlSize(
  width: number,
  height: number,
  options: JoystickControlSizeOptions = {},
): number {
  const chrome = (options.placement === "above" ? 32 : 0) + (options.showDetails ? 38 : 0);
  return Math.max(96, Math.min(width, height - chrome) - 4);
}

export type TitlePlacementSettings = { direction?: unknown; title_placement?: unknown };

/**
 * Bench cards overlay the title in the control's own corner; operator cards carry it in a row above. An authored
 * `title_placement` wins; otherwise a control with 32 px to spare beyond its body takes the row.
 */
export function resolveTitlePlacement(
  widget: { kind: string; layout: { width: number; height: number }; settings: TitlePlacementSettings },
  showDetails = false,
): TitlePlacement {
  const authored = widget.settings.title_placement;
  if (authored === "above" || authored === "overlay") {
    return authored;
  }
  if (showDetails) {
    return "above";
  }
  const { width, height } = widget.layout;
  if (widget.kind === "joystick") {
    return height - width >= 32 ? "above" : "overlay";
  }
  if (widget.kind === "slider" && widget.settings.direction === "horizontal") {
    return height >= 146 ? "above" : "overlay";
  }
  return "overlay";
}
