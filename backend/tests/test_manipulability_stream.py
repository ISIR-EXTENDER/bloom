"""/ee_jac reaches the runtime as Yoshikawa manipulability, not a raw matrix."""

from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.settings import Settings
from libs.config import InMemoryConfigurationRepository
from libs.ros_adapters.manipulability import ManipulabilityDerivingGateway, measure_from_sample_value
from libs.sessions import (
    NoopRuntimeTopicSubscriptionGateway,
    RuntimeTopicSample,
    RuntimeTopicSampleCallback,
    RuntimeTopicSubscription,
)
from libs.sessions.topics import is_live_subscription_gateway


class ReplayingGateway:
    """Delivers one prepared sample to whatever subscribes."""

    def __init__(self, value) -> None:
        self.value = value
        self.subscriptions: list[RuntimeTopicSubscription] = []

    def subscribe(self, subscription: RuntimeTopicSubscription, on_sample: RuntimeTopicSampleCallback):
        self.subscriptions.append(subscription)
        on_sample(
            RuntimeTopicSample(
                message_type="std_msgs/msg/Float64MultiArray",
                received_at="2026-09-15T10:00:00+00:00",
                topic=subscription.topic,
                value=self.value,
            )
        )

        class Handle:
            def close(self) -> None:
                return None

        return Handle()


IDENTITY_6X6 = {"data": [1.0 if i == j else 0.0 for i in range(6) for j in range(6)]}


def collect_samples(gateway, field_path: str) -> list[RuntimeTopicSample]:
    samples: list[RuntimeTopicSample] = []
    gateway.subscribe(
        RuntimeTopicSubscription(topic="/ee_jac", message_type="std_msgs/msg/Float64MultiArray", field_path=field_path),
        samples.append,
    )
    return samples


def test_the_manipulability_field_path_streams_the_measure() -> None:
    gateway = ManipulabilityDerivingGateway(ReplayingGateway(IDENTITY_6X6))

    [sample] = collect_samples(gateway, "manipulability")

    assert sample.value == {"manipulability": 1.0}
    assert sample.topic == "/ee_jac"


def test_other_field_paths_pass_through_untouched() -> None:
    gateway = ManipulabilityDerivingGateway(ReplayingGateway(IDENTITY_6X6))

    [sample] = collect_samples(gateway, "data")

    assert sample.value == IDENTITY_6X6


def test_a_malformed_jacobian_is_skipped_rather_than_forwarded() -> None:
    gateway = ManipulabilityDerivingGateway(ReplayingGateway({"data": [1.0, 2.0, 3.0, 4.0]}))

    samples = collect_samples(gateway, "manipulability")

    assert samples == []


def test_the_layout_row_count_wins_over_the_six_row_default() -> None:
    # A 2x2 identity read with the default six rows would be rejected.
    value = {"layout": {"dim": [{"label": "rows", "size": 2}]}, "data": [1.0, 0.0, 0.0, 1.0]}

    assert measure_from_sample_value(value) == 1.0


def test_create_app_wraps_only_live_subscription_gateways() -> None:
    live = create_app(
        Settings(environment="test"),
        InMemoryConfigurationRepository(),
        runtime_topic_subscription_gateway=ReplayingGateway(IDENTITY_6X6),
    )
    noop = create_app(
        Settings(environment="test"),
        InMemoryConfigurationRepository(),
        runtime_topic_subscription_gateway=NoopRuntimeTopicSubscriptionGateway(),
    )

    assert isinstance(live.state.runtime_topic_subscription_gateway, ManipulabilityDerivingGateway)
    # The Noop must stay recognisable, so subscription acks keep saying that
    # no samples will ever arrive.
    assert not is_live_subscription_gateway(noop.state.runtime_topic_subscription_gateway)


def test_the_derived_stream_reaches_a_websocket_subscriber() -> None:
    client = TestClient(
        create_app(
            Settings(environment="test"),
            InMemoryConfigurationRepository(),
            runtime_topic_subscription_gateway=ReplayingGateway(IDENTITY_6X6),
        )
    )

    with client.websocket_connect("/api/v1/runtime/ws") as websocket:
        websocket.receive_json()
        websocket.send_json(
            {
                "type": "subscribe_topic",
                "topic": "/ee_jac",
                "message_type": "std_msgs/msg/Float64MultiArray",
                "field_path": "manipulability",
                "widget_id": "feedback-manipulability",
            }
        )
        ack = websocket.receive_json()
        sample = websocket.receive_json()

    assert ack["type"] == "subscription_ack"
    assert sample["type"] == "topic_sample"
    assert sample["payload"]["value"] == {"manipulability": 1.0}
