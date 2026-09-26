"""A fallback API key in a logged query string is hidden however the client spelled it."""

import pytest

from apps.bloom_api.security import redact_api_key


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("GET /api/v1/runtime/ws?api_key=secret HTTP/1.1", "GET /api/v1/runtime/ws?api_key=*** HTTP/1.1"),
        ("GET /ws?api%5Fkey=secret&x=1", "GET /ws?api%5Fkey=***&x=1"),
        ("GET /ws?api%5fkey=secret", "GET /ws?api%5fkey=***"),
        ("GET /ws?API_KEY=secret", "GET /ws?API_KEY=***"),
        ("GET /ws?%61pi_key=secret", "GET /ws?%61pi_key=***"),
        ("GET /ws?x=1&api_key%3Dsecret", "GET /ws?x=1&api_key%3D***"),
    ],
)
def test_every_spelling_of_the_key_is_redacted(line: str, expected: str) -> None:
    assert redact_api_key(line) == expected


def test_other_parameters_are_left_alone() -> None:
    line = "GET /api/v1/ros/parameters?node=/cartesian_manager&names=shapers.snake.gain&my_api_key_hint=1"
    assert redact_api_key(line) == line
