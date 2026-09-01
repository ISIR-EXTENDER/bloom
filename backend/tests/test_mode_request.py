import pytest

from libs.ros_adapters.mode_request import (
    DEFAULT_GEOMETRIC_MODE,
    JACO_MODE,
    PASSTHROUGH_MODE,
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
    assert parse_mode_request("behaviour/joint_target/anything").normalized == (
        "behaviour/joint_target/anything"
    )
