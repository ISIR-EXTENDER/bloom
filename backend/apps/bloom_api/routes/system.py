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
    # The frame every operator command is stamped with. cartesian_manager does
    # no TF conversion, so a command in any other frame is dropped and the arm
    # simply stops -- which is why the runtime names the frame on screen rather
    # than leaving it in a config file (finding 11).
    command_frame_id: str


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
    return RuntimeCapabilitiesResponse(
        capabilities=[
            RuntimeCapabilityResponse(id=capability.id, available=capability.available, detail=capability.detail)
            for capability in describe_runtime_capabilities(request.app.state)
        ],
        command_frame_id=settings.ros_command_frame_id,
    )

