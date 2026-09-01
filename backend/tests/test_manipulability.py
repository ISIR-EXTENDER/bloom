import math

import pytest

from libs.ros_adapters.manipulability import (
    JacobianMatrix,
    ManipulabilityError,
    ManipulabilityScale,
    jacobian_from_float_array,
    yoshikawa_manipulability,
)


def test_reads_a_flat_float_array_as_a_six_row_jacobian() -> None:
    # /ee_jac is a Float64MultiArray, which carries no shape.
    matrix = jacobian_from_float_array(list(range(36)))

    assert matrix.rows == 6
    assert matrix.columns == 6
    assert matrix.row(1) == tuple(float(v) for v in range(6, 12))


def test_rejects_a_payload_that_does_not_divide_into_rows() -> None:
    with pytest.raises(ManipulabilityError, match="do not divide"):
        jacobian_from_float_array([1.0, 2.0, 3.0, 4.0, 5.0])


def test_rejects_an_empty_payload() -> None:
    with pytest.raises(ManipulabilityError, match="empty"):
        jacobian_from_float_array([])


def test_rejects_a_shape_mismatch() -> None:
    with pytest.raises(ManipulabilityError, match="values for a"):
        JacobianMatrix(rows=2, columns=3, values=(1.0, 2.0))


def test_identity_jacobian_has_unit_manipulability() -> None:
    identity = JacobianMatrix(
        rows=3,
        columns=3,
        values=(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0),
    )

    assert yoshikawa_manipulability(identity) == pytest.approx(1.0)


def test_scaled_identity_scales_as_the_determinant_does() -> None:
    # J = 2I over 3 rows: det(J J^T) = 4^3, so w = 8.
    scaled = JacobianMatrix(
        rows=3,
        columns=3,
        values=(2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0),
    )

    assert yoshikawa_manipulability(scaled) == pytest.approx(8.0)


def test_singular_jacobian_gives_zero() -> None:
    # Two identical rows: the arm cannot move independently in those directions.
    singular = JacobianMatrix(
        rows=3,
        columns=3,
        values=(1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0),
    )

    assert yoshikawa_manipulability(singular) == 0.0


def test_redundant_arm_is_supported() -> None:
    # 3x4: more joints than Cartesian directions, which is the normal case for a
    # redundant arm and must not be treated as singular.
    redundant = JacobianMatrix(
        rows=3,
        columns=4,
        values=(1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0),
    )

    assert yoshikawa_manipulability(redundant) == pytest.approx(math.sqrt(2.0))


def test_underactuated_arm_is_zero_rather_than_undefined() -> None:
    # Fewer joints than Cartesian degrees of freedom: J J^T is singular by
    # construction.
    underactuated = JacobianMatrix(rows=3, columns=2, values=(1.0, 0.0, 0.0, 1.0, 0.0, 0.0))

    assert yoshikawa_manipulability(underactuated) == 0.0


def test_scale_turns_an_absolute_measure_into_a_status() -> None:
    # The raw value is robot and unit dependent; a ratio against a reference
    # measured during normal work is what an operator can act on.
    scale = ManipulabilityScale(reference=0.5)

    assert scale.status(0.5) == "ok"
    assert scale.status(0.25) == "ok"
    assert scale.status(0.2) == "warning"
    assert scale.status(0.07) == "critical"
    assert scale.status(0.0) == "critical"


def test_scale_ratio_is_clamped_at_zero() -> None:
    scale = ManipulabilityScale(reference=0.5)

    assert scale.ratio(-1.0) == 0.0


def test_scale_rejects_nonsense_thresholds() -> None:
    with pytest.raises(ManipulabilityError, match="must be positive"):
        ManipulabilityScale(reference=0.0)
    with pytest.raises(ManipulabilityError, match="critical_ratio < warn_ratio"):
        ManipulabilityScale(reference=1.0, warn_ratio=0.1, critical_ratio=0.5)
