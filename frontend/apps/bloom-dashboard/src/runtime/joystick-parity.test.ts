import { describe, expect, it } from "vitest";

import { applyScaledDeadZone, composeTwist, contributionFromAxisMap } from "./teleop-composition";

/**
 * Parity with `input_interfaces/joystick_mapper`, the reference input for
 * `cartesian_manager`.
 *
 * Values come from `joystick_mapper/bringup/config/joystick_3d.yaml`:
 * deadzone 0.2, scale 1.0 on every axis, saturation 1.0.
 *
 * The mapper's B1 (default) maps the 3D mouse axes 0,1,2 onto linear x,y,z and
 * leaves angular undriven. B2 maps the same three axes onto angular x,y,z. A
 * Bloom translation joystick plus a Z slider covers B1; a rotation joystick plus
 * an RZ slider covers B2.
 */
const DEADZONE = 0.2;

/** Reference implementation, transcribed from signal_processing/dead_zone.cpp. */
function referenceScaledDeadZone(value: number, deadZone = DEADZONE, saturation = 1, maxValue = 1) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  const scaled = Math.min(Math.max((magnitude - deadZone) / (saturation - deadZone), 0), 1) * maxValue;
  return value >= 0 ? scaled : -scaled;
}

describe("applyScaledDeadZone matches signal_processing", () => {
  const samples = [-1, -0.9, -0.55, -0.3, -0.2001, -0.2, -0.19, -0.05, 0, 0.05, 0.19, 0.2, 0.2001, 0.3, 0.55, 0.9, 1];

  it.each(samples)("agrees with the C++ formula at %s", (value) => {
    expect(applyScaledDeadZone(value, DEADZONE)).toBeCloseTo(referenceScaledDeadZone(value), 12);
  });

  it("zeroes anything inside the dead zone", () => {
    expect(applyScaledDeadZone(0.2, DEADZONE)).toBe(0);
    expect(applyScaledDeadZone(-0.2, DEADZONE)).toBe(0);
  });

  it("ramps from zero at the dead-zone edge rather than stepping", () => {
    // The behaviour Bloom's magnitude dead zone did not have.
    expect(applyScaledDeadZone(0.2001, DEADZONE)).toBeCloseTo(0.000125, 6);
  });

  it("reaches full output at full deflection", () => {
    expect(applyScaledDeadZone(1, DEADZONE)).toBeCloseTo(1, 12);
    expect(applyScaledDeadZone(-1, DEADZONE)).toBeCloseTo(-1, 12);
  });

  it("saturates beyond full deflection", () => {
    expect(applyScaledDeadZone(1.8, DEADZONE)).toBeCloseTo(1, 12);
  });

  it("is symmetric about zero", () => {
    for (const v of [0.25, 0.5, 0.75, 1]) {
      expect(applyScaledDeadZone(-v, DEADZONE)).toBeCloseTo(-applyScaledDeadZone(v, DEADZONE), 12);
    }
  });
});

describe("a Bloom joystick matches the physical joystick", () => {
  const b1 = {
    x: { component: "linear_x" as const },
    y: { component: "linear_y" as const },
  };

  it("does not leak a small off-axis value, the way a magnitude dead zone does", () => {
    // Mostly-X push. joystick_mapper zeroes Y because 0.1 is inside its own
    // dead zone. A magnitude dead zone would have let 0.1 through, which the
    // operator feels as drift.
    const contribution = contributionFromAxisMap(b1, { x: 0.9, y: 0.1 }, DEADZONE);

    expect(contribution.linear_x).toBeCloseTo(referenceScaledDeadZone(0.9), 12);
    expect(contribution.linear_y ?? 0).toBe(0);
  });

  it("reproduces B1: three axes onto linear, angular untouched", () => {
    const twist = composeTwist([
      contributionFromAxisMap(b1, { x: 0.6, y: -0.4 }, DEADZONE),
      contributionFromAxisMap({ value: { component: "linear_z" } }, { value: 0.8 }, DEADZONE),
    ]);

    expect(twist.linear.x).toBeCloseTo(referenceScaledDeadZone(0.6), 12);
    expect(twist.linear.y).toBeCloseTo(referenceScaledDeadZone(-0.4), 12);
    expect(twist.linear.z).toBeCloseTo(referenceScaledDeadZone(0.8), 12);
    expect(twist.angular).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("reproduces B2: the same three axes onto angular, linear untouched", () => {
    const b2 = {
      x: { component: "angular_x" as const },
      y: { component: "angular_y" as const },
    };
    const twist = composeTwist([
      contributionFromAxisMap(b2, { x: 0.6, y: -0.4 }, DEADZONE),
      contributionFromAxisMap({ value: { component: "angular_z" } }, { value: 0.8 }, DEADZONE),
    ]);

    expect(twist.angular.x).toBeCloseTo(referenceScaledDeadZone(0.6), 12);
    expect(twist.angular.y).toBeCloseTo(referenceScaledDeadZone(-0.4), 12);
    expect(twist.angular.z).toBeCloseTo(referenceScaledDeadZone(0.8), 12);
    expect(twist.linear).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("honours a negative scale the way an inverted axis in the config does", () => {
    const inverted = contributionFromAxisMap({ value: { component: "linear_z", scale: -1 } }, { value: 0.8 }, DEADZONE);

    expect(inverted.linear_z).toBeCloseTo(-referenceScaledDeadZone(0.8), 12);
  });

  it("leaves a resting stick at exactly zero", () => {
    const twist = composeTwist([contributionFromAxisMap(b1, { x: 0.05, y: -0.05 }, DEADZONE)]);

    expect(twist.linear).toEqual({ x: 0, y: 0, z: 0 });
  });
});
