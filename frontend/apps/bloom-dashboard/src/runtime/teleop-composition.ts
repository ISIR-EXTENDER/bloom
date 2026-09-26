import { TELEOP_DEFAULT_TARGET } from "@bloom/widgets";

/**
 * Compose a full 6-DoF twist from several widgets.
 *
 * This mirrors the `AxisMap` model in `input_interfaces/joystick_mapper`, which
 * is the reference input implementation for `cartesian_manager`. There, each of
 * the six twist components carries an `AxisBinding { index, scale }`, an index of
 * `-1` means the component is not driven, and every publish emits the complete
 * twist rather than a partial one.
 *
 * Composition has to happen here rather than being left to the manager.
 * `InputManager::setCommand` *replaces* the latest command for a source and only
 * sums *across* sources, so if each widget published its own twist to
 * `/joystick_cartesian_command`, the last one to publish would erase the others:
 * a Z slider would wipe out the translation joystick.
 *
 * The manager also drops a source whose command is older than its `timeout_sec`
 * (0.2 s in the Explorer bringup), so the runtime must keep publishing the
 * composed twist, including zeros, rather than only on change.
 */

/** The six twist components, named as `cartesian_manager` names them. */
export const TWIST_COMPONENTS = ["linear_x", "linear_y", "linear_z", "angular_x", "angular_y", "angular_z"] as const;

export type TwistComponent = (typeof TWIST_COMPONENTS)[number];

export type TeleopVector3 = { x: number; y: number; z: number };
export type TeleopTwist = { angular: TeleopVector3; linear: TeleopVector3 };

/** Which component a widget output drives, and by how much. */
export type AxisBinding = {
  component: TwistComponent;
  scale?: number;
};

/**
 * A widget's outputs mapped onto twist components.
 *
 * A joystick drives `x` and `y`; a slider drives `value`.
 */
export type WidgetAxisMap = {
  value?: AxisBinding;
  x?: AxisBinding;
  y?: AxisBinding;
};

export type ComponentContribution = Partial<Record<TwistComponent, number>>;

const ZERO: TeleopVector3 = { x: 0, y: 0, z: 0 };

export function createZeroTwist(): TeleopTwist {
  return { angular: { ...ZERO }, linear: { ...ZERO } };
}

export function isZeroTwist(twist: TeleopTwist): boolean {
  return (
    twist.linear.x === 0 &&
    twist.linear.y === 0 &&
    twist.linear.z === 0 &&
    twist.angular.x === 0 &&
    twist.angular.y === 0 &&
    twist.angular.z === 0
  );
}

function isTwistComponent(value: unknown): value is TwistComponent {
  return typeof value === "string" && (TWIST_COMPONENTS as readonly string[]).includes(value);
}

function readAxisBinding(raw: unknown): AxisBinding | undefined {
  if (typeof raw === "string") {
    return isTwistComponent(raw) ? { component: raw } : undefined;
  }
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const component = record.component;
  if (!isTwistComponent(component)) {
    return undefined;
  }
  const scale = typeof record.scale === "number" && Number.isFinite(record.scale) ? record.scale : undefined;
  return scale === undefined ? { component } : { component, scale };
}

/**
 * Read an explicit `axis_mapping` from a runtime binding.
 *
 * Returns `undefined` when the binding does not declare one, so the caller can
 * fall back to the legacy translation/rotation behaviour.
 *
 * A binding may declare per-local-mode maps under `modes`, which is how
 * `joystick_mapper`'s local B1/B2 button works: it swaps the entire `AxisMap`
 * without publishing a mode request, so one physical stick drives translation in
 * B1 and orientation in B2. A Bloom app can do the same with one joystick
 * instead of needing two.
 *
 * ```json
 * "axis_mapping": {
 *   "x": { "component": "linear_x" },
 *   "y": { "component": "linear_y" },
 *   "modes": {
 *     "b2": { "x": { "component": "angular_x" }, "y": { "component": "angular_y" } }
 *   }
 * }
 * ```
 */
export function readWidgetAxisMap(runtimeBinding: unknown, modeId?: string): WidgetAxisMap | undefined {
  if (!runtimeBinding || typeof runtimeBinding !== "object") {
    return undefined;
  }
  const mapping = (runtimeBinding as Record<string, unknown>).axis_mapping;
  if (!mapping || typeof mapping !== "object") {
    return undefined;
  }

  const modeOverride = readModeAxisMap(mapping as Record<string, unknown>, modeId);
  if (modeOverride) {
    return modeOverride;
  }

  const record = mapping as Record<string, unknown>;
  const axisMap: WidgetAxisMap = {};
  const value = readAxisBinding(record.value);
  const x = readAxisBinding(record.x);
  const y = readAxisBinding(record.y);
  if (value) axisMap.value = value;
  if (x) axisMap.x = x;
  if (y) axisMap.y = y;

  return axisMap.value || axisMap.x || axisMap.y ? axisMap : undefined;
}

function readModeAxisMap(mapping: Record<string, unknown>, modeId?: string): WidgetAxisMap | undefined {
  if (!modeId) {
    return undefined;
  }
  const modes = mapping.modes;
  if (!modes || typeof modes !== "object") {
    return undefined;
  }
  const normalized = modeId.trim().toLowerCase();
  const candidate = (modes as Record<string, unknown>)[normalized];
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const record = candidate as Record<string, unknown>;
  const axisMap: WidgetAxisMap = {};
  const value = readAxisBinding(record.value);
  const x = readAxisBinding(record.x);
  const y = readAxisBinding(record.y);
  if (value) axisMap.value = value;
  if (x) axisMap.x = x;
  if (y) axisMap.y = y;

  return axisMap.value || axisMap.x || axisMap.y ? axisMap : undefined;
}

/**
 * The axis map a joystick gets when it declares no explicit mapping.
 *
 * This reproduces the existing behaviour exactly: a rotation-mode joystick
 * drives `angular_x`/`angular_y`, anything else drives `linear_x`/`linear_y`.
 */
export function defaultJoystickAxisMap(isRotation: boolean): WidgetAxisMap {
  return isRotation
    ? { x: { component: "angular_x" }, y: { component: "angular_y" } }
    : { x: { component: "linear_x" }, y: { component: "linear_y" } };
}

/**
 * Port of `signal_processing::applyScaledDeadZone`, the function
 * `joystick_mapper` applies to every axis.
 *
 * It is a **per-axis** dead zone that rescales what remains back to full range:
 * an input at the dead-zone edge produces 0 and full deflection produces
 * `maxValue`, with no step in between.
 *
 * Bloom's own joystick dead zone works differently: it tests the *magnitude* of
 * the 2D vector and passes the raw components through unscaled. That differs
 * from the physical joystick in two ways an operator can feel. A mostly-X push
 * leaks a small Y that the per-axis version would have zeroed, and crossing the
 * dead-zone edge jumps straight to the dead-zone value instead of ramping from
 * zero. Matching the mapper here is what makes a Bloom joystick and Mégane's
 * joystick produce the same twist for the same deflection.
 */
export function applyScaledDeadZone(value: number, deadZone: number, saturationZone = 1, maxValue = 1): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const magnitude = Math.abs(value);
  const safeDeadZone = Math.abs(deadZone);
  const safeSaturationZone = Math.max(Math.abs(saturationZone), safeDeadZone);
  const safeMaxValue = Math.abs(maxValue);

  if (magnitude <= safeDeadZone) {
    return 0;
  }

  if (safeSaturationZone - safeDeadZone <= 1e-12) {
    return value >= 0 ? safeMaxValue : -safeMaxValue;
  }

  const scaled =
    Math.min(Math.max((magnitude - safeDeadZone) / (safeSaturationZone - safeDeadZone), 0), 1) * safeMaxValue;

  return value >= 0 ? scaled : -scaled;
}

function applyBinding(value: number, binding: AxisBinding, deadZone: number | undefined): number {
  const conditioned = deadZone === undefined ? value : applyScaledDeadZone(value, deadZone);
  return conditioned * (binding.scale ?? 1);
}

/**
 * Map one widget's raw outputs onto twist components.
 *
 * `deadZone` is opt-in. Without it the raw value is scaled and passed through,
 * which is what Bloom did before axis mapping existed, so apps that have not
 * declared one are unchanged.
 */
export function contributionFromAxisMap(
  axisMap: WidgetAxisMap,
  outputs: { value?: number; x?: number; y?: number },
  deadZone?: number,
): ComponentContribution {
  const contribution: ComponentContribution = {};

  for (const key of ["value", "x", "y"] as const) {
    const binding = axisMap[key];
    const raw = outputs[key];
    if (!binding || typeof raw !== "number" || !Number.isFinite(raw)) {
      continue;
    }
    // Two widgets may drive the same component; accumulate rather than replace.
    contribution[binding.component] = (contribution[binding.component] ?? 0) + applyBinding(raw, binding, deadZone);
  }

  return contribution;
}

/** Read the optional per-axis dead zone declared beside an `axis_mapping`. */
export function readAxisDeadZone(runtimeBinding: unknown): number | undefined {
  if (!runtimeBinding || typeof runtimeBinding !== "object") {
    return undefined;
  }
  const raw = (runtimeBinding as Record<string, unknown>).axis_deadzone;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

/**
 * Sum every widget's contribution into one complete twist.
 *
 * Components nothing drives stay at zero, which is what an undriven axis means
 * in `joystick_mapper` too.
 */
export function composeTwist(contributions: Iterable<ComponentContribution>): TeleopTwist {
  const twist = createZeroTwist();

  for (const contribution of contributions) {
    twist.linear.x += contribution.linear_x ?? 0;
    twist.linear.y += contribution.linear_y ?? 0;
    twist.linear.z += contribution.linear_z ?? 0;
    twist.angular.x += contribution.angular_x ?? 0;
    twist.angular.y += contribution.angular_y ?? 0;
    twist.angular.z += contribution.angular_z ?? 0;
  }

  return twist;
}

/** The legacy `extender_msgs/TeleopCommand` topic, whose controller reads `mode`; cartesian_manager ignores it. */
export const LEGACY_TELEOP_TARGET = "/teleop_cmd";
const TELEOP_MODE = { rotation: 1, translation: 2, both: 3 } as const;

/**
 * The legacy mode for what the twist actually moves: a translation pad and a rotation pad held together
 * need BOTH, or the controller zeroes one part. Snake, other targets and a resting twist keep `declared`.
 */
export function composeTeleopMode(twist: TeleopTwist, declared: number, target: string): number {
  if (target !== LEGACY_TELEOP_TARGET || !(Object.values(TELEOP_MODE) as number[]).includes(declared)) {
    return declared;
  }
  const linear = twist.linear.x !== 0 || twist.linear.y !== 0 || twist.linear.z !== 0;
  const angular = twist.angular.x !== 0 || twist.angular.y !== 0 || twist.angular.z !== 0;
  if (linear && angular) return TELEOP_MODE.both;
  if (linear) return TELEOP_MODE.translation;
  if (angular) return TELEOP_MODE.rotation;
  return declared;
}

type TargetComposition = {
  contributions: Map<string, ComponentContribution>;
  frames: Map<string, string>;
};

/**
 * Accumulates per-widget contributions, one composition per teleop target topic.
 *
 * Held by the runtime dispatcher hook, because composition is inherently
 * stateful: the twist published when the Z slider moves must still carry
 * whatever the translation joystick is currently holding. Each target is its own
 * manager input, so a pad on one never rides out on another's topic.
 */
export class TeleopTwistComposer {
  private readonly byTarget = new Map<string, TargetComposition>();
  private readonly targetOfWidget = new Map<string, string>();

  contribute(
    widgetId: string,
    contribution: ComponentContribution,
    frameId = "",
    target = TELEOP_DEFAULT_TARGET,
  ): void {
    const previous = this.targetOfWidget.get(widgetId);
    if (previous !== undefined && previous !== target) {
      this.release(widgetId);
    }
    let composition = this.byTarget.get(target);
    if (!composition) {
      composition = { contributions: new Map(), frames: new Map() };
      this.byTarget.set(target, composition);
    }
    this.targetOfWidget.set(widgetId, target);
    composition.contributions.set(widgetId, contribution);
    if (frameId) {
      composition.frames.set(widgetId, frameId);
    } else {
      composition.frames.delete(widgetId);
    }
  }

  release(widgetId: string): void {
    const target = this.targetOfWidget.get(widgetId);
    if (target === undefined) {
      return;
    }
    this.targetOfWidget.delete(widgetId);
    const composition = this.byTarget.get(target);
    composition?.contributions.delete(widgetId);
    composition?.frames.delete(widgetId);
    if (composition?.contributions.size === 0) {
      this.byTarget.delete(target);
    }
  }

  clear(): void {
    this.byTarget.clear();
    this.targetOfWidget.clear();
  }

  get activeWidgetIds(): string[] {
    return [...this.targetOfWidget.keys()];
  }

  /** Whether any target is being driven. Summing across targets could cancel two opposite pads out. */
  get moving(): boolean {
    return [...this.byTarget.keys()].some((target) => !isZeroTwist(this.compose(target)));
  }

  compose(target = TELEOP_DEFAULT_TARGET): TeleopTwist {
    return composeTwist(this.byTarget.get(target)?.contributions.values() ?? []);
  }

  /**
   * The frame the composed twist goes out in.
   *
   * One message carries one frame, so the question is which. `cartesian_manager` rotates only the
   * angular part by it and passes the linear part through untouched, so only a widget that is
   * turning the hand has a stake: a translation pad and a rotation pad can hold different frames
   * without contradicting each other.
   *
   * A widget's own frame therefore wins while it is the only one turning. Two widgets turning under
   * different frames cannot both be honoured in one message, so the session's frame is kept and the
   * pair is named rather than one of them silently losing.
   *
   * A turning widget with no frame of its own turns in the session's, so it takes part in the conflict.
   * A frame outside `allowedFrameIds` never leaves: the session frame, or the backend default, goes instead.
   */
  resolveFrame(
    sessionFrameId = "",
    allowedFrameIds?: readonly string[],
    target = TELEOP_DEFAULT_TARGET,
  ): { frameId: string; conflicting: string[] } {
    const composition = this.byTarget.get(target);
    const declared = new Map<string, string>();
    for (const [widgetId, contribution] of composition?.contributions ?? []) {
      if (turnsTheHand(contribution)) {
        declared.set(widgetId, composition?.frames.get(widgetId) || sessionFrameId);
      }
    }

    const distinct = new Set(declared.values());
    const allows = (frameId: string) => !frameId || !allowedFrameIds || allowedFrameIds.includes(frameId);
    const fallback = allows(sessionFrameId) ? sessionFrameId : "";
    if (distinct.size === 1) {
      const frameId = [...distinct][0] as string;
      return { frameId: allows(frameId) ? frameId : fallback, conflicting: [] };
    }
    return {
      frameId: fallback,
      conflicting: distinct.size > 1 ? [...declared.keys()].sort() : [],
    };
  }
}

/** Whether a contribution moves any angular component, which is the only part a frame rotates. */
function turnsTheHand(contribution: ComponentContribution): boolean {
  return TWIST_COMPONENTS.some(
    (component) => component.startsWith("angular_") && Math.abs(contribution[component] ?? 0) > 0,
  );
}
