"""The rosidl class behind a ROS type name, resolved once per gateway."""


def resolve_message_class(message_type: str, cache: dict[str, type], purpose: str) -> type:
    cached = cache.get(message_type)
    if cached is not None:
        return cached

    try:
        from rosidl_runtime_py.utilities import get_message
    except ModuleNotFoundError as exc:
        raise RuntimeError(f"rosidl_runtime_py is required to {purpose}") from exc

    try:
        message_cls = get_message(message_type)
    except (AttributeError, ModuleNotFoundError, ValueError) as exc:
        raise ValueError(f"Unsupported ROS message type: {message_type}") from exc

    cache[message_type] = message_cls
    return message_cls
