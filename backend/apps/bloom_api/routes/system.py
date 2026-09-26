from fastapi import APIRouter, Request
from pydantic import BaseModel

from apps.bloom_api.capabilities import describe_runtime_capabilities
from apps.bloom_api.settings import Settings
from libs.ros_adapters.safety import MAX_ANGULAR_SPEED_TOPIC, MAX_LINEAR_SPEED_TOPIC

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


class RuntimeCapabilityResponse(BaseModel):
    id: str
    available: bool
    detail: str


class RuntimeCapabilitiesResponse(BaseModel):
    capabilities: list[RuntimeCapabilityResponse]
    # Which arm this backend drives; empty when the deployment has not said.
    robot_name: str
    # Default stamp for operator commands, named on screen (finding 11).
    command_frame_id: str
    # Frames cartesian_manager accepts as rotation references.
    command_frame_ids: list[str]
    # Topics this server lets a joystick drive (BLOOM_ALLOWED_TELEOP_TARGETS); an app's own list can only narrow it.
    teleop_targets: list[str] = []
    #: The caps the server enforces on the speed-limit topics, so the Builder can warn before saving a slider past them.
    max_linear_speed_limit: float
    max_angular_speed_limit: float
    # The deployment's own allowlists, which an app's lists can only narrow; the Builder offers no Allow past them.
    allowed_ros_publish_topics: list[str] = []
    allowed_ros_message_types: list[str] = []
    allowed_ros_parameters: list[str] = []
    allowed_ros_service_calls: list[str] = []


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        environment=settings.environment,
    )


@router.get("/capabilities", response_model=RuntimeCapabilitiesResponse)
def capabilities(request: Request) -> RuntimeCapabilitiesResponse:
    """Report which runtime seams are really wired.

    The builder uses this to say what a widget can and cannot do here, instead
    of offering everything and letting the ones that need ROS fail quietly.
    """
    settings: Settings = request.app.state.settings
    supports_command_frames = settings.ros_command_backend == "cartesian_manager"
    policy = request.app.state.runtime_command_policy
    return RuntimeCapabilitiesResponse(
        capabilities=[
            RuntimeCapabilityResponse(id=capability.id, available=capability.available, detail=capability.detail)
            for capability in describe_runtime_capabilities(request.app.state)
        ],
        command_frame_id=settings.ros_command_frame_id if supports_command_frames else "",
        command_frame_ids=list(settings.allowed_command_frame_ids) if supports_command_frames else [],
        robot_name=settings.robot_name,
        teleop_targets=list(request.app.state.teleop_target_directory.targets()),
        max_linear_speed_limit=_topic_cap(request, MAX_LINEAR_SPEED_TOPIC, settings.max_linear_speed_limit),
        max_angular_speed_limit=_topic_cap(request, MAX_ANGULAR_SPEED_TOPIC, settings.max_angular_speed_limit),
        allowed_ros_publish_topics=list(policy.allowed_publish_topics),
        allowed_ros_message_types=list(policy.allowed_message_types),
        allowed_ros_parameters=list(policy.allowed_parameters),
        allowed_ros_service_calls=list(policy.allowed_service_calls),
    )


def _topic_cap(request: Request, topic: str, fallback: float) -> float:
    """The bound the policy actually enforces, which an injected policy may set apart from settings."""
    bounds = request.app.state.runtime_command_policy.topic_value_bounds
    return next((upper for bounded, _lower, upper in bounds if bounded == topic), fallback)
