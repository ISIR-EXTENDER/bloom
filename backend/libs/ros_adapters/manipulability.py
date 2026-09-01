"""Manipulability from the end-effector Jacobian.

`qontrol_controller` publishes `Jacobian_EE` on `/ee_jac` and Bloom ignored it
entirely. It is the one signal that says *how well* the arm can move right now,
as opposed to where it is: near a singularity the QP still accepts commands, the
operator still pushes the joystick, and the arm barely responds in one direction.
Without a readout that is indistinguishable from a broken interface.

Yoshikawa's measure, ``w = sqrt(det(J J^T))``, is the standard scalar for this.
It goes to zero at a singularity. Because its absolute value depends on the robot
and the units, the useful presentation is a ratio against a reference value the
operator sees during normal work, which is what `ManipulabilityScale` provides.

This is computed in the backend rather than the browser because the Jacobian is a
6xN matrix arriving at control rate; shipping every one to the UI to reduce it to
a single number would waste the WebSocket on data no widget displays.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence


class ManipulabilityError(ValueError):
    """Raised when a Jacobian cannot be interpreted."""


@dataclass(frozen=True)
class JacobianMatrix:
    """A row-major Jacobian, as `std_msgs/msg/Float64MultiArray` carries it."""

    rows: int
    columns: int
    values: tuple[float, ...]

    def __post_init__(self) -> None:
        if self.rows <= 0 or self.columns <= 0:
            raise ManipulabilityError("jacobian needs a positive shape")
        if len(self.values) != self.rows * self.columns:
            raise ManipulabilityError(
                f"jacobian has {len(self.values)} values for a {self.rows}x{self.columns} matrix"
            )

    def row(self, index: int) -> tuple[float, ...]:
        start = index * self.columns
        return self.values[start : start + self.columns]


def jacobian_from_float_array(values: Sequence[float], rows: int = 6) -> JacobianMatrix:
    """Interpret a flat `Float64MultiArray` payload as a Jacobian.

    The array carries no shape, so the row count has to be supplied. Six rows is
    the Cartesian case: three linear and three angular.
    """
    numbers = [float(value) for value in values]
    if not numbers:
        raise ManipulabilityError("jacobian payload is empty")
    if rows <= 0 or len(numbers) % rows != 0:
        raise ManipulabilityError(f"{len(numbers)} values do not divide into {rows} rows")

    return JacobianMatrix(rows=rows, columns=len(numbers) // rows, values=tuple(numbers))


def _multiply_by_transpose(matrix: JacobianMatrix) -> list[list[float]]:
    """Compute ``J J^T``, which is square and small (6x6 for a Cartesian arm)."""
    return [
        [sum(a * b for a, b in zip(matrix.row(i), matrix.row(j))) for j in range(matrix.rows)]
        for i in range(matrix.rows)
    ]


def _determinant(matrix: list[list[float]]) -> float:
    """Determinant by LU decomposition with partial pivoting.

    Small dense matrix, so an explicit implementation avoids adding a numeric
    dependency to the backend for one 6x6 determinant.
    """
    size = len(matrix)
    work = [row[:] for row in matrix]
    determinant = 1.0

    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(work[row][column]))
        if abs(work[pivot][column]) < 1e-15:
            # Singular to working precision: manipulability is zero.
            return 0.0
        if pivot != column:
            work[column], work[pivot] = work[pivot], work[column]
            determinant = -determinant

        determinant *= work[column][column]
        for row in range(column + 1, size):
            factor = work[row][column] / work[column][column]
            for k in range(column, size):
                work[row][k] -= factor * work[column][k]

    return determinant


def yoshikawa_manipulability(matrix: JacobianMatrix) -> float:
    """``w = sqrt(det(J J^T))``. Zero at a singularity."""
    if matrix.columns < matrix.rows:
        # Fewer joints than Cartesian degrees of freedom: J J^T is singular by
        # construction, so the measure is zero rather than undefined.
        return 0.0

    determinant = _determinant(_multiply_by_transpose(matrix))
    # Numerically the determinant can dip slightly below zero at a singularity.
    return math.sqrt(determinant) if determinant > 0 else 0.0


@dataclass(frozen=True)
class ManipulabilityScale:
    """Turn an absolute measure into something an operator can read.

    The raw value has no meaning on its own: it depends on the robot, the joint
    units, and the pose. A ratio against a reference measured during normal work
    does have meaning, and thresholds on that ratio can drive a warning.
    """

    reference: float
    warn_ratio: float = 0.4
    critical_ratio: float = 0.15

    def __post_init__(self) -> None:
        if self.reference <= 0:
            raise ManipulabilityError("reference manipulability must be positive")
        if not 0 < self.critical_ratio < self.warn_ratio < 1:
            raise ManipulabilityError("expected 0 < critical_ratio < warn_ratio < 1")

    def ratio(self, measure: float) -> float:
        return max(0.0, measure) / self.reference

    def status(self, measure: float) -> str:
        ratio = self.ratio(measure)
        if ratio <= self.critical_ratio:
            return "critical"
        if ratio <= self.warn_ratio:
            return "warning"
        return "ok"


__all__ = [
    "JacobianMatrix",
    "ManipulabilityError",
    "ManipulabilityScale",
    "jacobian_from_float_array",
    "yoshikawa_manipulability",
]
