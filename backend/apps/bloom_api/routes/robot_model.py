from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from apps.bloom_api.security import BloomPrincipal, require_observer
from libs.ros_adapters.robot_model import ASSET_CONTENT_TYPES, RobotModelGateway

router = APIRouter(prefix="/ros/robot-model", tags=["ros"])


class RobotModelResponse(BaseModel):
    node: str
    status: str
    urdf: str | None


def get_robot_model_gateway(request: Request) -> RobotModelGateway:
    return request.app.state.robot_model_gateway


@router.get("", response_model=RobotModelResponse)
def read_robot_model(
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> RobotModelResponse:
    """The URDF the robot runs with, so the 3D view draws this robot and not a shipped copy."""
    urdf = get_robot_model_gateway(request).description()
    return RobotModelResponse(
        node=request.app.state.settings.ros_robot_description_node,
        status="ready" if urdf else "unavailable",
        urdf=urdf,
    )


@router.get("/assets/{package}/{asset_path:path}")
def read_robot_model_asset(
    package: str,
    asset_path: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> FileResponse:
    """A mesh the URDF names as package://<package>/<path>, from the package's share directory."""
    path = get_robot_model_gateway(request).asset(package, asset_path)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="robot model asset not found")
    return FileResponse(path, media_type=ASSET_CONTENT_TYPES[path.suffix.lower()])
