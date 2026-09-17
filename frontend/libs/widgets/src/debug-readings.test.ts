import { describe, expect, it } from "vitest";

import { readJacobian, readJointLimits, readJointStates, yoshikawaManipulability } from "./debug-readings";

const identity = (scale = 1) => Array.from({ length: 36 }, (_, index) => (index % 7 === 0 ? scale : 0));

describe("jacobian readings", () => {
  it("reads rows from the layout, and six rows without one", () => {
    expect(readJacobian({ data: identity() })).toMatchObject({ rows: 6, columns: 6 });
    expect(readJacobian({ data: Array(42).fill(0), layout: { dim: [{ size: 6 }, { size: 7 }] } })).toMatchObject({
      rows: 6,
      columns: 7,
    });
    expect(readJacobian({ data: Array(40).fill(0) })).toBeNull();
    expect(readJacobian({ data: [] })).toBeNull();
    expect(readJacobian("not a matrix")).toBeNull();
  });

  it("measures manipulability like the backend", () => {
    expect(yoshikawaManipulability(readJacobian({ data: identity() }) as never)).toBeCloseTo(1);
    // Six rows scaled by 1.414: det(J J^T) = 2^6, so w = 8.
    expect(yoshikawaManipulability(readJacobian({ data: identity(Math.SQRT2) }) as never)).toBeCloseTo(8);
    expect(yoshikawaManipulability(readJacobian({ data: Array(36).fill(1) }) as never)).toBe(0);
  });
});

describe("joint state readings", () => {
  it("reads position, velocity and effort, and limit proximity only where a limit is known", () => {
    const rows = readJointStates(
      { name: ["joint_1", "joint_2"], position: [0.9, 0], velocity: [0.1], effort: [] },
      readJointLimits({ joint_1: [-1, 1], joint_2: "unknown" }),
    );

    expect(rows[0]).toEqual({
      effort: null,
      name: "joint_1",
      position: 0.9,
      proximity: expect.closeTo(0.9),
      velocity: 0.1,
    });
    expect(rows[1]).toEqual({ effort: null, name: "joint_2", position: 0, proximity: null, velocity: null });
    expect(readJointStates({ name: ["a"] })).toEqual([]);
  });
});

describe("plotting a flag", () => {
  it("reads true and false as 1 and 0", async () => {
    const { appendTopicPlotSample } = await import("./telemetry");
    const settings = { fieldPath: "data", historySeconds: 30, maxSamples: 10 };
    const faulted = appendTopicPlotSample(
      [],
      { receivedAt: "2026-09-17T10:00:00Z", topic: "/fault", value: { data: true } },
      settings,
    );
    const cleared = appendTopicPlotSample(
      faulted,
      { receivedAt: "2026-09-17T10:00:01Z", topic: "/fault", value: { data: false } },
      settings,
    );

    expect(cleared.map((sample) => sample.value)).toEqual([1, 0]);
  });
});
