import pytest

from libs.ros_adapters.actuators import (
    ActuatorError,
    GripperCalibration,
    build_digital_output_payload,
    build_gripper_payload,
)

# Explorer values from tablet_interface's parameter profiles.
EXPLORER = GripperCalibration(open_position=0.2, close_position=1.1)


def test_open_and_close_map_to_the_calibrated_positions() -> None:
    assert build_gripper_payload("open", EXPLORER) == {"data": [0.2]}
    assert build_gripper_payload("close", EXPLORER) == {"data": [1.1]}


def test_action_is_case_and_space_insensitive() -> None:
    assert build_gripper_payload("  CLOSE ", EXPLORER) == {"data": [1.1]}


def test_rejects_an_unknown_action() -> None:
    with pytest.raises(ActuatorError, match="expected open or close"):
        build_gripper_payload("halfway", EXPLORER)


@pytest.mark.parametrize(
    "position,expected",
    [(0.2, "open"), (0.25, "open"), (0.64, "open"), (0.66, "close"), (1.1, "close"), (2.0, "close")],
)
def test_measured_position_is_classified_by_nearest(position: float, expected: str) -> None:
    # Nearest-of-two, so a partially closed gripper reports the state it is
    # closer to rather than falling on an arbitrary side of a threshold.
    assert EXPLORER.action_for(position) == expected


def test_digital_output_is_a_pin_value_pair() -> None:
    # tools/hub reads a flat [pin, value, ...] array, not a scalar.
    assert build_digital_output_payload(2, True) == {"data": [2.0, 1.0]}
    assert build_digital_output_payload(2, False) == {"data": [2.0, 0.0]}


def test_digital_output_rejects_a_negative_channel() -> None:
    with pytest.raises(ActuatorError, match="must not be negative"):
        build_digital_output_payload(-1, True)


def test_a_different_gripper_needs_only_a_new_calibration() -> None:
    # The point of keeping calibration in one place: a new hand is one object,
    # not an edit to every screen that has a gripper button.
    other = GripperCalibration(open_position=0.0, close_position=0.8)

    assert build_gripper_payload("open", other) == {"data": [0.0]}
    assert other.action_for(0.7) == "close"
