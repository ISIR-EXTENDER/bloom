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
 */
export function readWidgetAxisMap(runtimeBinding: unknown): WidgetAxisMap | undefined {
  if (!runtimeBinding || typeof runtimeBinding !== "object") {
    return undefined;
  }
  const mapping = (runtimeBinding as Record<string, unknown>).axis_mapping;
  if (!mapping || typeof mapping !== "object") {
    return undefined;
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

/**
 * Accumulates per-widget contributions for one teleop target topic.
 *
 * Held by the runtime dispatcher hook, because composition is inherently
 * stateful: the twist published when the Z slider moves must still carry
 * whatever the translation joystick is currently holding.
 */
export class TeleopTwistComposer {
  private readonly contributions = new Map<string, ComponentContribution>();

  contribute(widgetId: string, contribution: ComponentContribution): void {
    this.contributions.set(widgetId, contribution);
  }

  release(widgetId: string): void {
    this.contributions.delete(widgetId);
  }

  clear(): void {
    this.contributions.clear();
  }

  get activeWidgetIds(): string[] {
    return [...this.contributions.keys()];
  }

  compose(): TeleopTwist {
    return composeTwist(this.contributions.values());
  }
}
