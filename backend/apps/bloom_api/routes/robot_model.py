import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from apps.bloom_api.routes.runtime_common import run_blocking_ros_read
from apps.bloom_api.security import BloomPrincipal, require_observer, require_observer_on_loop
from libs.ros_adapters.robot_model import ASSET_CONTENT_TYPES, RobotModelGateway

router = APIRouter(prefix="/ros/robot-model", tags=["ros"])


class RobotModelResponse(BaseModel):
    node: str
    status: str
    urdf: str | None


def get_robot_model_gateway(request: Request) -> RobotModelGateway:
    return request.app.state.robot_model_gateway


# Meshes change when a package is rebuilt, not while a session runs.
ASSET_CACHE_CONTROL = "private, max-age=300"


@router.get("", response_model=RobotModelResponse)
async def read_robot_model(
    request: Request,
    response: Response,
    _principal: BloomPrincipal = Depends(require_observer_on_loop),
) -> RobotModelResponse | Response:
    """The URDF the robot runs with, so the 3D view draws this robot and not a shipped copy."""
    urdf = await run_blocking_ros_read(request, get_robot_model_gateway(request).description)
    node = request.app.state.settings.ros_robot_description_node
    # The view asks again every few seconds; an unchanged robot costs a hash, not the whole description.
    etag = f'"{hashlib.sha256((urdf or "").encode()).hexdigest()[:32]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag})
    response.headers["ETag"] = etag
    return RobotModelResponse(node=node, status="ready" if urdf else "unavailable", urdf=urdf)


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
    return FileResponse(
        path,
        media_type=ASSET_CONTENT_TYPES[path.suffix.lower()],
        headers={"Cache-Control": ASSET_CACHE_CONTROL},
    )
