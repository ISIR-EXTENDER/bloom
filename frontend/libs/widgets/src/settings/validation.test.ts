import { describe, expect, it } from "vitest";
import {
  isJsonSerializable,
  isSameJson,
  validateNumber,
  validateNumberArray,
  validateOneOf,
  validatePlotSeriesList,
  validateRuntimeBinding,
  validateString,
} from "./validation";

describe("field validators", () => {
  it("bound a number on both sides and name the bound it broke", () => {
    expect(validateNumber({ gain: 3 }, "gain", { min: 0, max: 10 })).toEqual([]);
    expect(validateNumber({ gain: -1 }, "gain", { min: 0 })).toEqual([
      { field: "gain", message: "gain must be greater than or equal to 0" },
    ]);
    expect(validateNumber({ gain: 11 }, "gain", { max: 10 })).toEqual([
      { field: "gain", message: "gain must be less than or equal to 10" },
    ]);
    expect(validateNumber({ gain: Number.NaN }, "gain")).toEqual([{ field: "gain", message: "gain must be a number" }]);
  });

  it("take only finite numbers in a number list", () => {
    expect(validateNumberArray([0, 0.5, -1], "segment_values")).toEqual([]);
    expect(validateNumberArray([0, Number.POSITIVE_INFINITY], "segment_values")).toEqual([
      { field: "segment_values", message: "segment_values must contain only finite numbers" },
    ]);
    expect(validateNumberArray("0,1", "segment_values")).toEqual([
      { field: "segment_values", message: "segment_values must be an array" },
    ]);
  });

  it("list the choices when a select holds something else", () => {
    expect(validateOneOf({ direction: "vertical" }, "direction", ["horizontal", "vertical"])).toEqual([]);
    expect(validateOneOf({ direction: "diagonal" }, "direction", ["horizontal", "vertical"])).toEqual([
      { field: "direction", message: "direction must be one of: horizontal, vertical" },
    ]);
  });

  it("require a string unless told blank is fine", () => {
    expect(validateString({ topic: "  " }, "topic")).toEqual([{ field: "topic", message: "topic is required" }]);
    expect(validateString({ topic: "  " }, "topic", { allowEmpty: true })).toEqual([]);
    expect(validateString({ topic: 3 }, "topic")).toEqual([{ field: "topic", message: "topic must be a string" }]);
  });
});

describe("json helpers", () => {
  it("compare records by content, at any depth, and anything else by identity", () => {
    expect(isSameJson({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(isSameJson({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(isSameJson({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(isSameJson("x", "x")).toBe(true);
  });

  it("refuse a value JSON cannot carry", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(isJsonSerializable(loop)).toBe(false);
    expect(isJsonSerializable({ n: 1 })).toBe(true);
  });
});

describe("plot series rows", () => {
  it("let a row still being filled in through, and stop a relative topic", () => {
    expect(validatePlotSeriesList({ series: "x" })).toEqual([{ field: "series", message: "series must be a list" }]);
    expect(
      validatePlotSeriesList({
        series: [
          { topic: "", fieldPath: "" },
          { topic: "/ee_pose", field_path: "pose.position.z" },
          { topic: "ee_pose", fieldPath: "pose.position.z" },
          { topic: 3 },
          null,
        ],
      }),
    ).toEqual([
      { field: "series", message: "series 3: a topic starts with /, such as /ee_pose" },
      { field: "series", message: "series 4 needs a text topic and field_path" },
      { field: "series", message: "series 5 needs a text topic and field_path" },
    ]);
  });
});

describe("a runtime binding", () => {
  it("must be an object naming a known adapter and a target", () => {
    expect(validateRuntimeBinding("teleop")).toEqual([
      { field: "runtime_binding", message: "runtime_binding must be an object" },
    ]);
    expect(validateRuntimeBinding({ adapter: "serial", target: " " }).map((error) => error.field)).toEqual([
      "runtime_binding.adapter",
      "runtime_binding.target",
    ]);
    expect(validateRuntimeBinding({ adapter: "teleop", target: "linear_z" })).toEqual([]);
  });

  it("names the node and parameter a parameter binding must carry", () => {
    expect(
      validateRuntimeBinding({ adapter: "parameter", target: "parameter", value_mapping: { node: "manager" } }),
    ).toEqual([
      { field: "runtime_binding.value_mapping.node", message: "node must be a ROS node name" },
      { field: "runtime_binding.value_mapping.parameter", message: "parameter is required" },
    ]);
    expect(
      validateRuntimeBinding({
        adapter: "parameter",
        target: "parameter",
        value_mapping: { node: "/cartesian_manager", parameter: "shapers.snake.gain" },
      }),
    ).toEqual([]);
  });

  it("takes a value mapping only as a JSON object", () => {
    expect(validateRuntimeBinding({ adapter: "topic", target: "data", value_mapping: "raw" })).toEqual([
      { field: "runtime_binding.value_mapping", message: "value_mapping must be a JSON object" },
    ]);
    expect(validateRuntimeBinding({ adapter: "topic", target: "data", value_mapping: undefined })).toEqual([]);
  });
});
