import logging
import subprocess
from pathlib import Path

import pytest

from libs.sessions.recording import (
    NoopRuntimeRecordingGateway,
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
    # The label describes the run and the suffix identifies it, so two runs can share a label.
    assert "-sandbox-debug-" in receipt.recording_id
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
    assert f"-{'a' * 40}-" in build_recording_id(
        RuntimeRecordingRequest(label="A" * 80, output_folder="data", topics=("/a",))
    )


def test_two_recordings_with_one_label_in_the_same_second_stay_separate():
    """The second used to take the first's id, and the first could then never be stopped."""
    request = RuntimeRecordingRequest(topics=("/joint_states",), output_folder="data/recordings", label="run")

    first = build_recording_id(request)
    second = build_recording_id(request)

    assert first != second
    assert first.startswith("rosbag-") and "run" in first


def test_closing_the_api_stops_every_recording(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # Nothing listed or stopped them: a reload lost the id and ros2 bag record wrote until the disk filled.
    from fastapi.testclient import TestClient

    from apps.bloom_api.main import create_app
    from apps.bloom_api.settings import Settings
    from libs.config import InMemoryConfigurationRepository

    processes: list[FakeRosbagProcess] = []

    def fake_popen(command: list[str], stderr: object, stdout: object, text: bool) -> FakeRosbagProcess:
        processes.append(FakeRosbagProcess(command=command, stderr=stderr, stdout=stdout, text=text))
        return processes[-1]

    monkeypatch.setattr("libs.sessions.recording.which", lambda executable: f"/usr/bin/{executable}")
    gateway = RosbagRuntimeRecordingGateway(base_directory=tmp_path, popen_factory=fake_popen)
    app = create_app(Settings(environment="test"), InMemoryConfigurationRepository(), runtime_recording_gateway=gateway)

    with TestClient(app):
        gateway.start(RuntimeRecordingRequest(label="run", output_folder="rec", topics=("/joint_states",)))
        assert processes[0].terminated is False

    assert processes[0].terminated is True


def test_without_a_recorder_a_start_is_simulated_and_its_stop_still_answered() -> None:
    gateway = NoopRuntimeRecordingGateway()
    request = RuntimeRecordingRequest(topics=("/joint_states",), output_folder="data/recordings", label="run")

    started = gateway.start(request)
    stopped = gateway.stop(started.recording_id)

    assert started.status == "simulated"
    assert started.recording_id.startswith("simulated-")
    assert (started.topics, started.output_folder) == (("/joint_states",), "data/recordings")
    assert (stopped.status, stopped.recording_id, stopped.topics) == ("stopped", started.recording_id, ())
    assert gateway.start(request).recording_id != started.recording_id


def make_gateway(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, process_factory=FakeRosbagProcess):
    processes: list[FakeRosbagProcess] = []

    def fake_popen(command: list[str], stderr: object, stdout: object, text: bool) -> FakeRosbagProcess:
        processes.append(process_factory(command=command, stderr=stderr, stdout=stdout, text=text))
        return processes[-1]

    monkeypatch.setattr("libs.sessions.recording.which", lambda executable: f"/usr/bin/{executable}")
    return RosbagRuntimeRecordingGateway(base_directory=tmp_path, popen_factory=fake_popen), processes


def test_stopping_an_unknown_recording_is_answered_rather_than_raised(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    gateway, _ = make_gateway(monkeypatch, tmp_path)

    receipt = gateway.stop("rosbag-never-started")

    assert receipt.status == "stopped"
    assert receipt.recording_id == "rosbag-never-started"
    assert "not found or already stopped" in receipt.detail
    assert (receipt.topics, receipt.output_folder) == ((), "")


def test_a_recording_id_already_tracked_is_never_replaced(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr("libs.sessions.recording.build_recording_id", lambda request: "rosbag-fixed")
    gateway, processes = make_gateway(monkeypatch, tmp_path)
    request = RuntimeRecordingRequest(topics=("/joint_states",), output_folder="rec")
    gateway.start(request)

    with pytest.raises(RuntimeError, match="already tracked as rosbag-fixed"):
        gateway.start(request)

    assert len(processes) == 1
    assert gateway.stop("rosbag-fixed").status == "stopped"
    assert processes[0].terminated


class ExitedProcess(FakeRosbagProcess):
    def poll(self) -> int:
        return 0


class StuckProcess(FakeRosbagProcess):
    def wait(self, timeout: int | None = None) -> int:
        self.wait_calls += 1
        if not self.killed:
            raise subprocess.TimeoutExpired(cmd=self.command, timeout=timeout or 0)
        return -9


def test_a_recorder_that_already_exited_is_not_terminated_again(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    gateway, processes = make_gateway(monkeypatch, tmp_path, ExitedProcess)
    started = gateway.start(RuntimeRecordingRequest(topics=("/joint_states",), output_folder="rec"))

    stopped = gateway.stop(started.recording_id)

    assert processes[0].terminated is False
    assert stopped.status == "stopped"
    assert stopped.output_folder == started.output_folder


def test_a_recorder_that_ignores_terminate_is_killed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    gateway, processes = make_gateway(monkeypatch, tmp_path, StuckProcess)
    started = gateway.start(RuntimeRecordingRequest(topics=("/joint_states",), output_folder="rec"))

    stopped = gateway.stop(started.recording_id)

    assert processes[0].terminated and processes[0].killed
    assert processes[0].wait_calls == 2
    assert stopped.status == "stopped"


class UnstoppableProcess(FakeRosbagProcess):
    def terminate(self) -> None:
        raise OSError("process vanished mid-terminate")


def test_shutdown_stops_the_other_recordings_when_one_will_not_stop(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    def factory(command: list[str], stderr: object, stdout: object, text: bool) -> FakeRosbagProcess:
        cls = UnstoppableProcess if "/bad" in command else FakeRosbagProcess
        return cls(command=command, stderr=stderr, stdout=stdout, text=text)

    gateway, processes = make_gateway(monkeypatch, tmp_path, factory)
    bad = gateway.start(RuntimeRecordingRequest(topics=("/bad",), output_folder="rec"))
    good = gateway.start(RuntimeRecordingRequest(topics=("/good",), output_folder="rec"))
    caplog.set_level(logging.ERROR, logger="libs.sessions.recording")

    gateway.stop_all()

    [good_process] = [process for process in processes if "/good" in process.command]
    assert good_process.terminated
    assert "not found or already stopped" in gateway.stop(bad.recording_id).detail
    assert "not found or already stopped" in gateway.stop(good.recording_id).detail
    assert any(bad.recording_id in record.getMessage() for record in caplog.records)
