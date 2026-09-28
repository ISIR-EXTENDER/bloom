import pytest

from libs.ros_adapters.mode_request import (
    DEFAULT_GEOMETRIC_MODE,
    INTENT_SCALING_MODE,
    JACO_MODE,
    PASSTHROUGH_MODE,
    SHARED_CONTROL_MODE,
    SNAKE_MODE,
    ModeRequestError,
    normalize_mode_request,
    parse_mode_request,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("geometric/snake", "geometric/snake"),
        ("  geometric/snake  ", "geometric/snake"),
        ("GEOMETRIC/SNAKE", "geometric/snake"),
        ("behaviour/joint-target/home", "behaviour/joint_target/home"),
    ],
)
def test_normalize_matches_manager_rules(raw: str, expected: str) -> None:
    assert normalize_mode_request(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        (DEFAULT_GEOMETRIC_MODE, "geometric/both"),
        (JACO_MODE, "geometric/jaco"),
        (SNAKE_MODE, "geometric/snake"),
        (PASSTHROUGH_MODE, "behaviour/passthrough"),
        ("Behaviour/Joint-Target/Home", "behaviour/joint_target/home"),
    ],
)
def test_parse_accepts_manager_grammar(raw: str, expected: str) -> None:
    assert parse_mode_request(raw).normalized == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "geometric",
        "geometric/",
        "geometric/spiral",
        "geometric/jaco/extra",
        "behaviour/passthrough/extra",
        "behaviour/joint_target",
        "behaviour/unknown",
        "kinematic/jaco",
    ],
)
def test_parse_rejects_invalid_requests(raw: str) -> None:
    with pytest.raises(ModeRequestError):
        parse_mode_request(raw)


def test_joint_targets_are_one_shot() -> None:
    # The manager returns to passthrough by itself after dispatching a target,
    # so runtime state must not treat this as a sticky mode.
    assert parse_mode_request("behaviour/joint_target/home").one_shot is True
    assert parse_mode_request("geometric/snake").one_shot is False
    assert parse_mode_request("behaviour/passthrough").one_shot is False


def test_joint_target_names_are_not_validated_here() -> None:
    # The manager owns the target-name list through its parameters.
    assert parse_mode_request("behaviour/joint_target/anything").normalized == ("behaviour/joint_target/anything")


def test_pose_targets_are_one_shot_like_joint_targets() -> None:
    """The manager returns to passthrough once the pose is within tolerance, and passthrough cancels it."""
    request = parse_mode_request("Behaviour/Pose-Target/Ready")
    assert request.normalized == "behaviour/pose_target/ready"
    assert request.one_shot is True
    with pytest.raises(ModeRequestError):
        parse_mode_request("behaviour/pose_target")


def test_shared_control_is_a_lasting_behaviour_ended_on_leave() -> None:
    request = parse_mode_request("Behaviour/Shared-Control")
    assert request.normalized == SHARED_CONTROL_MODE
    assert request.one_shot is False
    assert request.cancel_on_leave is True
    assert parse_mode_request("behaviour/shared_control/reset").cancel_on_leave is True
    assert parse_mode_request("geometric/snake").cancel_on_leave is False
    assert parse_mode_request("behaviour/passthrough").cancel_on_leave is False
    for invalid in ("behaviour/shared_control/other", "behaviour/shared_control/reset/extra"):
        with pytest.raises(ModeRequestError):
            parse_mode_request(invalid)


def test_intent_scaling_is_a_lasting_behaviour_ended_on_leave() -> None:
    request = parse_mode_request("Behaviour/Intent-Scaling")
    assert request.normalized == INTENT_SCALING_MODE
    assert request.one_shot is False
    assert request.cancel_on_leave is True
    with pytest.raises(ModeRequestError):
        parse_mode_request("behaviour/intent_scaling/extra")


def test_the_shared_control_reset_enters_shared_control() -> None:
    request = parse_mode_request("behaviour/shared_control/reset")
    assert request.normalized == "behaviour/shared_control/reset"
    assert request.cancel_on_leave is True
    assert "reset" in request.detail
