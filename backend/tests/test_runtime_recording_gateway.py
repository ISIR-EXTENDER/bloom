from pathlib import Path

import pytest

from libs.sessions.recording import (
    RosbagRuntimeRecordingGateway,
    RuntimeRecordingRequest,
    build_recording_id,
    normalize_recording_label,
)


class FakeRosbagProcess:
    def __init__(self, command: list[str], stderr: object, stdout: object, text: bool) -> None:
        self.command = command
        self.killed = False
        self.stderr = stderr
        self.stdout = stdout
        self.terminated = False
        self.text = text
        self.wait_calls = 0

    def poll(self) -> int | None:
        return None

    def terminate(self) -> None:
        self.terminated = True

    def wait(self, timeout: int | None = None) -> int:
        self.wait_calls += 1
        return 0

    def kill(self) -> None:
        self.killed = True


def test_rosbag_recording_gateway_starts_and_stops_rosbag_process(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    processes: list[FakeRosbagProcess] = []

    def fake_popen(command: list[str], stderr: object, stdout: object, text: bool) -> FakeRosbagProcess:
        process = FakeRosbagProcess(command=command, stderr=stderr, stdout=stdout, text=text)
        processes.append(process)
        return process

    monkeypatch.setattr("libs.sessions.recording.which", lambda executable: f"/usr/bin/{executable}")
    gateway = RosbagRuntimeRecordingGateway(base_directory=tmp_path, popen_factory=fake_popen)

    receipt = gateway.start(
        RuntimeRecordingRequest(
            label="Sandbox Debug!",
            output_folder="data/recordings",
            topics=("/teleop_cmd", "/joint_states"),
        )
    )
    stop_receipt = gateway.stop(receipt.recording_id)

    assert receipt.status == "recording"
    assert receipt.recording_id.startswith("rosbag-")
    assert receipt.recording_id.endswith("-sandbox-debug")
    assert receipt.output_folder.startswith(str(tmp_path / "data" / "recordings" / "rosbag-"))
    assert processes[0].command == [
        "ros2",
        "bag",
        "record",
        "-o",
        receipt.output_folder,
        "/teleop_cmd",
        "/joint_states",
    ]
    assert processes[0].terminated is True
    assert processes[0].killed is False
    assert stop_receipt.status == "stopped"
    assert stop_receipt.topics == ("/teleop_cmd", "/joint_states")


def test_rosbag_recording_gateway_reports_missing_ros2_executable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("libs.sessions.recording.which", lambda executable: None)
    gateway = RosbagRuntimeRecordingGateway()

    with pytest.raises(RuntimeError, match="ros2 executable is not available"):
        gateway.start(RuntimeRecordingRequest(output_folder="data/recordings", topics=("/teleop_cmd",)))


def test_recording_labels_are_safe_for_output_paths() -> None:
    assert normalize_recording_label(" Sandbox Debug / Robot #1 ") == "sandbox-debug-robot-1"
    assert normalize_recording_label("!!!") == ""
    assert build_recording_id(RuntimeRecordingRequest(label="A" * 80, output_folder="data", topics=("/a",))).endswith(
        f"-{'a' * 40}"
    )
