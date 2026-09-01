import pytest

from libs.ros_adapters.mode_request import ModeRequestError
from libs.ros_adapters.publishers import RosPublishRequest
from libs.ros_adapters.safe_publish import normalize_mode_request_payload

MODE_TOPICS = ("/mode_request",)


def request(topic: str, payload: dict) -> RosPublishRequest:
    return RosPublishRequest(topic=topic, message_type="std_msgs/msg/String", payload=payload)


def test_valid_mode_passes() -> None:
    normalize_mode_request_payload(request("/mode_request", {"data": "geometric/snake"}), MODE_TOPICS)


def test_mode_is_normalized_before_checking() -> None:
    normalize_mode_request_payload(
        request("/mode_request", {"data": "Behaviour/Joint-Target/Home"}), MODE_TOPICS
    )


def test_invalid_mode_is_rejected() -> None:
    with pytest.raises(ModeRequestError, match="unknown geometric mode"):
        normalize_mode_request_payload(request("/mode_request", {"data": "geometric/spiral"}), MODE_TOPICS)


def test_non_string_payload_is_rejected() -> None:
    with pytest.raises(ModeRequestError, match="string 'data' field"):
        normalize_mode_request_payload(request("/mode_request", {"data": 42}), MODE_TOPICS)


def test_other_topics_are_untouched() -> None:
    # Only the mode-request topic is subject to the manager grammar.
    normalize_mode_request_payload(request("/cmd/gripper", {"data": "anything at all"}), MODE_TOPICS)


def test_mode_is_published_in_canonical_form() -> None:
    # cartesian_manager normalizes internally, but /mode_request should carry the
    # canonical value so echoes and tablet_interface agree.
    normalized = normalize_mode_request_payload(
        request("/mode_request", {"data": "GEOMETRIC/Snake"}), MODE_TOPICS
    )

    assert normalized.payload["data"] == "geometric/snake"


def test_already_canonical_request_is_passed_through_unchanged() -> None:
    original = request("/mode_request", {"data": "geometric/snake"})

    assert normalize_mode_request_payload(original, MODE_TOPICS) is original
