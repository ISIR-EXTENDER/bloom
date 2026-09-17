/** Readings Bloom Debug shows as tables: a row-major Jacobian and per-joint states. Nothing here invents a value. */

export type JacobianReading = { columns: number; rows: number; values: readonly number[] };

/** `std_msgs/msg/Float64MultiArray` as the backend reads it: rows from `layout.dim[0].size`, else the Cartesian six. */
export function readJacobian(value: unknown): JacobianReading | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null;
  }
  const values = value.data.map(Number);
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry))) {
    return null;
  }
  const dims = isRecord(value.layout) && Array.isArray(value.layout.dim) ? value.layout.dim : [];
  const declared = isRecord(dims[0]) ? Number(dims[0].size) : Number.NaN;
  const rows = Number.isInteger(declared) && declared > 0 ? declared : 6;
  if (values.length % rows !== 0) {
    return null;
  }
  return { columns: values.length / rows, rows, values };
}

/** Yoshikawa's `w = sqrt(det(J J^T))`, the same measure the backend streams; zero at a singularity. */
export function yoshikawaManipulability(jacobian: JacobianReading): number {
  const { columns, rows, values } = jacobian;
  const product = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: rows }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < columns; k += 1) {
        sum += (values[i * columns + k] as number) * (values[j * columns + k] as number);
      }
      return sum;
    }),
  );
  return Math.sqrt(Math.max(0, determinant(product)));
}

export type JointReading = {
  effort: number | null;
  name: string;
  position: number;
  /** 0 at mid-range, 1 at a limit; null when no limit is configured for the joint. */
  proximity: number | null;
  velocity: number | null;
};

/** Rows of a `sensor_msgs/msg/JointState`. Limits come from settings; a joint without one reports none. */
export function readJointStates(
  value: unknown,
  limits: Readonly<Record<string, readonly [number, number]>> = {},
): JointReading[] {
  if (!isRecord(value) || !Array.isArray(value.name) || !Array.isArray(value.position)) {
    return [];
  }
  const velocity = Array.isArray(value.velocity) ? value.velocity : [];
  const effort = Array.isArray(value.effort) ? value.effort : [];
  return value.name.flatMap((rawName, index) => {
    const position = Number(value.position?.[index as never]);
    if (!Number.isFinite(position)) {
      return [];
    }
    const name = String(rawName);
    const limit = limits[name];
    return [
      {
        effort: finiteOrNull(effort[index]),
        name,
        position,
        proximity: limit ? limitProximity(position, limit) : null,
        velocity: finiteOrNull(velocity[index]),
      },
    ];
  });
}

export function readJointLimits(value: unknown): Record<string, readonly [number, number]> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, range]) =>
      Array.isArray(range) &&
      range.length === 2 &&
      Number.isFinite(Number(range[0])) &&
      Number.isFinite(Number(range[1])) &&
      Number(range[0]) < Number(range[1])
        ? [[name, [Number(range[0]), Number(range[1])] as const]]
        : [],
    ),
  );
}

function limitProximity(position: number, [lower, upper]: readonly [number, number]): number {
  const halfRange = (upper - lower) / 2;
  const fromNearest = Math.min(position - lower, upper - position);
  return Math.min(1, Math.max(0, 1 - fromNearest / halfRange));
}

function determinant(matrix: number[][]): number {
  const size = matrix.length;
  const work = matrix.map((row) => [...row]);
  let result = 1;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row]?.[column] as number) > Math.abs(work[pivot]?.[column] as number)) {
        pivot = row;
      }
    }
    const pivotValue = work[pivot]?.[column] as number;
    if (Math.abs(pivotValue) < 1e-15) {
      return 0;
    }
    if (pivot !== column) {
      [work[column], work[pivot]] = [work[pivot] as number[], work[column] as number[]];
      result = -result;
    }
    result *= pivotValue;
    for (let row = column + 1; row < size; row += 1) {
      const factor = (work[row]?.[column] as number) / pivotValue;
      for (let k = column; k < size; k += 1) {
        (work[row] as number[])[k] = (work[row]?.[k] as number) - factor * (work[column]?.[k] as number);
      }
    }
  }
  return result;
}

function finiteOrNull(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && Number.isFinite(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
