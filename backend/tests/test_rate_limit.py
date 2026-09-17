"""The rate limiter counts per key, so the set of keys has to stay bounded."""

from libs.sessions.rate_limit import MAX_TRACKED_KEYS, RuntimeCommandRateLimiter


class MovableClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_idle_keys_are_forgotten_once_the_map_fills() -> None:
    clock = MovableClock()
    limiter = RuntimeCommandRateLimiter(max_commands_per_second=10, clock=clock)
    for index in range(MAX_TRACKED_KEYS):
        limiter.ensure_allowed(f"websocket_teleop:/made/up/{index}")
    assert len(limiter.tracked_keys) == MAX_TRACKED_KEYS

    clock.now = 2.0
    limiter.ensure_allowed("websocket_teleop:/joystick_cartesian_command")

    assert limiter.tracked_keys == ("websocket_teleop:/joystick_cartesian_command",)


def test_a_key_still_inside_its_window_survives_the_sweep() -> None:
    clock = MovableClock()
    limiter = RuntimeCommandRateLimiter(max_commands_per_second=10, clock=clock)
    limiter.ensure_allowed("websocket_teleop:/joystick_cartesian_command")

    clock.now = 0.5
    for index in range(MAX_TRACKED_KEYS):
        limiter.ensure_allowed(f"websocket_teleop:/made/up/{index}")

    assert "websocket_teleop:/joystick_cartesian_command" in limiter.tracked_keys


def test_a_swept_key_starts_counting_again_from_nothing() -> None:
    clock = MovableClock()
    limiter = RuntimeCommandRateLimiter(max_commands_per_second=1, clock=clock)
    limiter.ensure_allowed("websocket_teleop:/joystick_cartesian_command")

    clock.now = 2.0
    limiter.ensure_allowed("websocket_teleop:/joystick_cartesian_command")

    assert limiter.tracked_keys == ("websocket_teleop:/joystick_cartesian_command",)
