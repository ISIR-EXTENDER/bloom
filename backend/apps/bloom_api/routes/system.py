from fastapi import APIRouter, Request
from pydantic import BaseModel

from apps.bloom_api.capabilities import describe_runtime_capabilities
from apps.bloom_api.settings import Settings

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
    return RuntimeCapabilitiesResponse(
        capabilities=[
            RuntimeCapabilityResponse(id=capability.id, available=capability.available, detail=capability.detail)
            for capability in describe_runtime_capabilities(request.app.state)
        ],
        command_frame_id=settings.ros_command_frame_id if supports_command_frames else "",
        command_frame_ids=list(settings.allowed_command_frame_ids) if supports_command_frames else [],
        robot_name=settings.robot_name,
        teleop_targets=list(request.app.state.teleop_target_directory.targets()),
    )
