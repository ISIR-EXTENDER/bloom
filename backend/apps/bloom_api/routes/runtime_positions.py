"""Saved poses: captured from the live joint state, listed, deleted and exported for the manager."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from apps.bloom_api.security import (
    BloomPrincipal,
    require_observer,
    require_operator,
)
from libs.config import (
    ConfigurationNotFoundError,
)
from libs.sessions.positions import (
    JointPose,
    PositionLibrary,
    PositionLibraryError,
    library_backed_by,
    render_joint_targets_yaml,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class SavedPositionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    joint_names: tuple[str, ...] = Field(min_length=1)
    positions: tuple[float, ...] = Field(min_length=1)
    description: str = Field(default="", max_length=280)


class SavedPositionResponse(BaseModel):
    name: str
    joint_names: tuple[str, ...]
    positions: tuple[float, ...]
    description: str


class SavedPositionListResponse(BaseModel):
    positions: tuple[SavedPositionResponse, ...]


class SavedPositionExportResponse(BaseModel):
    """The block to paste into cartesian_manager's explorer_params.yaml."""

    yaml: str
    target_names: tuple[str, ...]


def find_position_library(request: Request, config_id: str = "", app_id: str = "") -> PositionLibrary | None:
    """One library per application.

    A pose is a joint vector in one arm's joint order. Sharing a single library
    across Explorer and Kinova let a six-joint Explorer pose appear in a Kinova
    export, where the same numbers mean different angles.
    """
    libraries = position_libraries(request)
    key = f"{config_id}:{app_id}"
    store = getattr(request.app.state, "position_store", None)
    if key not in libraries and store is not None and (config_id or app_id):
        # After an API restart the map is empty but the store is not.
        libraries[key] = library_backed_by(store, config_id, app_id)
    return libraries.get(key)


def get_position_library_for_write(request: Request, config_id: str = "", app_id: str = "") -> PositionLibrary:
    # Only a real application gets a library, so arbitrary ids cannot grow the map.
    if config_id or app_id:
        try:
            bundle = request.app.state.configuration_repository.get(config_id)
        except (ConfigurationNotFoundError, ValueError):
            bundle = None
        if bundle is None or all(application.id != app_id for application in bundle.applications):
            raise HTTPException(status_code=404, detail=f"no application '{app_id}' in configuration '{config_id}'")
    libraries = position_libraries(request)
    key = f"{config_id}:{app_id}"
    if key not in libraries:
        libraries[key] = library_backed_by(getattr(request.app.state, "position_store", None), config_id, app_id)
    return libraries[key]


def position_libraries(request: Request) -> dict[str, PositionLibrary]:
    libraries = getattr(request.app.state, "position_libraries", None)
    if libraries is None:
        libraries = {}
        request.app.state.position_libraries = libraries
    return libraries


def to_position_response(pose: JointPose) -> SavedPositionResponse:
    return SavedPositionResponse(
        name=pose.name,
        joint_names=pose.joint_names,
        positions=pose.positions,
        description=pose.description,
    )


@router.get("/positions", response_model=SavedPositionListResponse)
def list_saved_positions(
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_observer),
) -> SavedPositionListResponse:
    library = find_position_library(request, config_id, app_id)
    poses = library.list() if library is not None else ()
    return SavedPositionListResponse(positions=tuple(to_position_response(p) for p in poses))


@router.post("/positions", response_model=SavedPositionResponse)
def save_position(
    payload: SavedPositionRequest,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_operator),
) -> SavedPositionResponse:
    library = get_position_library_for_write(request, config_id, app_id)
    try:
        pose = JointPose(
            name=payload.name,
            joint_names=tuple(payload.joint_names),
            positions=tuple(payload.positions),
            description=payload.description,
        )
        return to_position_response(library.save(pose))
    except PositionLibraryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/positions/{name}", response_model=SavedPositionListResponse)
def delete_position(
    name: str,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_operator),
) -> SavedPositionListResponse:
    library = find_position_library(request, config_id, app_id)
    if library is None or not library.remove(name):
        raise HTTPException(status_code=404, detail=f"no saved position named '{name}'")
    return SavedPositionListResponse(positions=tuple(to_position_response(p) for p in library.list()))


@router.get("/positions/export", response_model=SavedPositionExportResponse)
def export_positions(
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_observer),
) -> SavedPositionExportResponse:
    """Render the joint_targets block for cartesian_manager.

    Bloom cannot register a target on the manager at runtime, so the bridge
    between the two storage layers is an export the operator pastes into
    explorer_params.yaml and restarts the node to pick up.
    """
    library = find_position_library(request, config_id, app_id)
    poses = library.list() if library is not None else ()
    try:
        return SavedPositionExportResponse(
            yaml=render_joint_targets_yaml(poses),
            target_names=tuple(pose.name for pose in poses),
        )
    except PositionLibraryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
