import pytest

from libs.sessions.positions import (
    JointPose,
    PositionLibrary,
    PositionLibraryError,
    pose_from_joint_state,
    render_joint_targets_yaml,
)

JOINTS = ("joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6")
HOME = (2.5, 0.3, -2.4, 2.97, 1.2, -0.5)
BOIRE = (1.0, -0.2, 0.5, 1.5, -1.0, 0.25)


def pose(name: str, positions=HOME) -> JointPose:
    return JointPose(name=name, joint_names=JOINTS, positions=positions)


def test_pose_rejects_a_length_mismatch() -> None:
    with pytest.raises(PositionLibraryError, match="values for"):
        JointPose(name="bad", joint_names=JOINTS, positions=(1.0, 2.0))


def test_pose_rejects_an_empty_name() -> None:
    with pytest.raises(PositionLibraryError, match="needs a name"):
        JointPose(name="  ", joint_names=JOINTS, positions=HOME)


def test_saving_twice_replaces_in_place() -> None:
    # A duplicate target name would be rejected by the manager.
    library = PositionLibrary()
    library.save(pose("home"))
    library.save(pose("boire", BOIRE))
    updated = tuple([9.0] * 6)
    library.save(pose("home", updated))

    assert [item.name for item in library.list()] == ["home", "boire"]
    assert library.get("home").positions == updated


def test_library_rejects_a_different_joint_order() -> None:
    # The manager's block carries one joint_names list for every target, so a
    # library with two orders could not be exported at all.
    library = PositionLibrary()
    library.save(pose("home"))

    with pytest.raises(PositionLibraryError, match="but the library uses"):
        library.save(JointPose(name="other", joint_names=("a", "b"), positions=(0.0, 0.0)))


def test_remove_and_rename() -> None:
    library = PositionLibrary()
    library.save(pose("home"))
    library.save(pose("boire", BOIRE))

    assert library.rename("boire", "drink").name == "drink"
    assert library.remove("home") is True
    assert library.remove("home") is False
    assert [item.name for item in library.list()] == ["drink"]


def test_rename_rejects_a_collision() -> None:
    library = PositionLibrary()
    library.save(pose("home"))
    library.save(pose("boire", BOIRE))

    with pytest.raises(PositionLibraryError, match="already exists"):
        library.rename("boire", "home")


def test_export_renders_a_flattened_block_in_target_order() -> None:
    block = render_joint_targets_yaml([pose("home"), pose("boire", BOIRE)])

    assert "joint_targets:" in block
    assert "          - home\n          - boire" in block
    assert "          # home" in block
    assert "          # boire" in block
    # 6 joints + 2 target names + 12 position values
    assert block.count("          - ") == len(JOINTS) + 2 + len(JOINTS) * 2
    assert "- 2.5000" in block
    assert "- 0.2500" in block


def test_export_refuses_an_empty_library() -> None:
    with pytest.raises(PositionLibraryError, match="no saved positions"):
        render_joint_targets_yaml([])


def test_capture_matches_joints_by_name_not_index() -> None:
    # /joint_states may publish in any order; reading by index would record a
    # pose with the joints permuted.
    captured = pose_from_joint_state(
        "boire",
        JOINTS,
        state_names=["joint_3", "joint_1", "joint_2", "joint_6", "joint_5", "joint_4"],
        state_positions=[0.5, 1.0, -0.2, 0.25, -1.0, 1.5],
    )

    assert captured.positions == BOIRE


def test_capture_reports_missing_joints() -> None:
    with pytest.raises(PositionLibraryError, match="missing: joint_6"):
        pose_from_joint_state(
            "boire",
            JOINTS,
            state_names=["joint_1", "joint_2", "joint_3", "joint_4", "joint_5"],
            state_positions=[1.0, -0.2, 0.5, 1.5, -1.0],
        )
