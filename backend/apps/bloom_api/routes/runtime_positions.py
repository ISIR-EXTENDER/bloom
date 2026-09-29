"""Saved poses: saved from the live robot, listed, renamed, deleted, exported, and sent back as a pose target."""

import logging
import math
import threading
from dataclasses import replace

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.bloom_api.routes.ros import publish_as_runtime_owner
from apps.bloom_api.routes.runtime_common import (
    find_runtime_application,
    get_runtime_audit_log,
    get_runtime_command_policy,
    manager_facts,
)
from apps.bloom_api.security import (
    RUNTIME_SESSION_HEADER,
    BloomPrincipal,
    execute_as_runtime_owner,
    require_observer,
    require_operator,
    require_runtime_owner,
)
from libs.config import (
    ConfigurationNotFoundError,
)
from libs.ros_adapters.mode_request import PASSTHROUGH_MODE, POSE_TARGET_MESSAGE_TYPE
from libs.sessions import RuntimeAuditRecord
from libs.sessions.go_to import LIVE_SAMPLE_SEC
from libs.sessions.positions import (
    JOINT_NAME_PATTERN,
    POSITION_NAME_PATTERN,
    CartesianPose,
    JointPose,
    PositionExistsError,
    PositionLibrary,
    PositionLibraryError,
    bare_frame,
    hand_pose_fingerprint,
    library_backed_by,
    normalize_pose_name,
    pose_offset,
    pose_target_payload,
    render_joint_targets_yaml,
    render_pose_targets_yaml,
)

logger = logging.getLogger(__name__)

router = APIRouter()
_LIBRARIES_LOCK = threading.RLock()
#: A tablet's view of the hand may trail the server's by a sample; farther than this, the hand moved.
CLIENT_VS_SERVER = (0.01, 0.05)
NOT_WHERE_COMMANDED = "The arm is not where it was commanded (in contact or lagging): move it free and save again."


class EePoseModel(BaseModel):
    """The hand's pose as /ee_pose stamped it: position in metres, orientation x, y, z, w."""

    model_config = ConfigDict(allow_inf_nan=False)

    frame_id: str = Field(min_length=1, max_length=128)
    position: tuple[float, float, float]
    orientation: tuple[float, float, float, float]

    def to_pose(self) -> CartesianPose:
        return CartesianPose(frame_id=self.frame_id, position=self.position, orientation=self.orientation)


class SavedEePoseModel(EePoseModel):
    #: True when the measured tip (TF) agreed with the commanded /ee_pose at save time.
    verified: bool = False
    #: What a Go to must name, so a pose changed since it was shown is not sent.
    fingerprint: str = ""


def valid_pose_name(name: str) -> str:
    normalized = normalize_pose_name(name)
    if not POSITION_NAME_PATTERN.fullmatch(normalized):
        raise ValueError("a position name may use only a-z, 0-9 and _, up to 64 characters")
    return normalized


class SavedPositionRequest(BaseModel):
    """A new pose. Without a name the server picks the next free `pose_N`; a name already held is refused.

    `ee_pose` asks for the hand's pose too. The server saves its own newest /ee_pose, never the tablet's numbers,
    and refuses when the tablet's differ by more than a centimetre: the hand moved while saving.
    """

    model_config = ConfigDict(allow_inf_nan=False)

    name: str | None = Field(default=None, min_length=1, max_length=64)
    joint_names: tuple[str, ...] = Field(min_length=1)
    positions: tuple[float, ...] = Field(min_length=1)
    description: str = Field(default="", max_length=280)
    ee_pose: EePoseModel | None = None

    @field_validator("name")
    @classmethod
    def _name_the_manager_can_reach(cls, name: str | None) -> str | None:
        return valid_pose_name(name) if name is not None else None

    @field_validator("ee_pose")
    @classmethod
    def _a_pose_the_manager_takes(cls, ee_pose: EePoseModel | None) -> EePoseModel | None:
        if ee_pose is not None:
            try:
                ee_pose.to_pose()
            except PositionLibraryError as exc:
                raise ValueError(str(exc)) from exc
        return ee_pose

    @field_validator("joint_names")
    @classmethod
    def _plain_joint_names(cls, joint_names: tuple[str, ...]) -> tuple[str, ...]:
        if not all(JOINT_NAME_PATTERN.fullmatch(joint) for joint in joint_names):
            raise ValueError("a joint name may use only letters, digits, _ and -, up to 128 characters")
        return joint_names


class SavedPositionRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)

    @field_validator("name")
    @classmethod
    def _name_the_manager_can_reach(cls, name: str) -> str:
        return valid_pose_name(name)


class GoToRequest(BaseModel):
    #: The fingerprint of the pose the tablet showed and armed.
    fingerprint: str = Field(min_length=1, max_length=64)


class SavedPositionResponse(BaseModel):
    name: str
    joint_names: tuple[str, ...]
    positions: tuple[float, ...]
    description: str
    ee_pose: SavedEePoseModel | None = None


class PoseTargetResponse(BaseModel):
    """What Go to sent: the saved pose, as a PoseStamped on the manager's pose_target topic."""

    name: str
    topic: str
    status: str
    detail: str


class CancelResponse(BaseModel):
    detail: str


class SavedPositionListResponse(BaseModel):
    positions: tuple[SavedPositionResponse, ...]


class SavedPositionExportResponse(BaseModel):
    """The blocks to paste into cartesian_manager's params: joint targets, and pose targets for saved hand poses."""

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
        # After an API restart the map is empty but the store is not. Read without caching: any id pair can be
        # asked for, and only a write, which checks the app exists, may add to the map.
        return library_backed_by(store, config_id, app_id)
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
    key = f"{config_id}:{app_id}"
    # Two first saves racing each built a library, and the one that lost the map took its pose with it.
    with _LIBRARIES_LOCK:
        libraries = position_libraries(request)
        if key not in libraries:
            libraries[key] = library_backed_by(getattr(request.app.state, "position_store", None), config_id, app_id)
        return libraries[key]


def position_libraries(request: Request) -> dict[str, PositionLibrary]:
    with _LIBRARIES_LOCK:
        libraries = getattr(request.app.state, "position_libraries", None)
        if libraries is None:
            libraries = {}
            request.app.state.position_libraries = libraries
        return libraries


def to_position_response(pose: JointPose) -> SavedPositionResponse:
    ee_pose = pose.ee_pose
    return SavedPositionResponse(
        name=pose.name,
        joint_names=pose.joint_names,
        positions=pose.positions,
        description=pose.description,
        ee_pose=(
            SavedEePoseModel(
                frame_id=ee_pose.frame_id,
                position=ee_pose.position,
                orientation=ee_pose.orientation,
                verified=ee_pose.verified,
                fingerprint=hand_pose_fingerprint(ee_pose),
            )
            if ee_pose is not None
            else None
        ),
    )


def refuse(request: Request, status_code: int, detail: str, name: str = "") -> HTTPException:
    """A refused save, Go to, cancel, rename or delete: in the audit log, with its reason."""
    get_runtime_audit_log(request).record(
        RuntimeAuditRecord(
            channel="runtime_positions",
            detail=detail,
            session_id=request.headers.get(RUNTIME_SESSION_HEADER, "").strip(),
            status="rejected",
            target=name,
        )
    )
    return HTTPException(status_code=status_code, detail=detail)


def live_hand_pose(request: Request) -> CartesianPose | None:
    live = request.app.state.command_state_tracker.live_hand(LIVE_SAMPLE_SEC)
    if live is None:
        return None
    try:
        return CartesianPose(frame_id=bare_frame(live[0]), position=live[1], orientation=live[2])
    except PositionLibraryError:
        return None


def measured_tip_pose(request: Request) -> CartesianPose | None:
    """The tip through TF, when the tip frame is known and the joint states behind TF are live."""
    source = getattr(request.app.state, "tip_pose_source", None)
    facts = manager_facts(request)
    tracker = request.app.state.command_state_tracker
    if source is None or not facts.base_frame or not facts.tip_frame or not tracker.live_joint_names(LIVE_SAMPLE_SEC):
        return None
    return source.lookup(facts.base_frame, facts.tip_frame)


def beyond(offset: tuple[float, float], limit: tuple[float, float]) -> bool:
    return offset[0] > limit[0] or offset[1] > limit[1]


def saved_hand_pose(request: Request, asked: CartesianPose) -> CartesianPose:
    """The server's own newest /ee_pose, checked against the tablet's, the arm's reach and the measured tip."""
    live = live_hand_pose(request)
    if live is None:
        raise refuse(request, 409, "No live hand pose on /ee_pose: the arm's present pose cannot be saved.")
    if bare_frame(asked.frame_id) != live.frame_id or beyond(pose_offset(live, asked), CLIENT_VS_SERVER):
        raise refuse(request, 409, "The hand moved while saving: save again once it is still.")
    reach = request.app.state.settings.max_hand_reach_m
    if math.hypot(*live.position) > reach:
        raise refuse(request, 422, f"The hand pose is farther than {reach:.2f} m from the base, past the arm's reach.")
    measured = measured_tip_pose(request)
    if measured is not None and measured.frame_id == live.frame_id:
        settings = request.app.state.settings
        if beyond(pose_offset(live, measured), (settings.pose_save_max_offset_m, settings.pose_save_max_offset_rad)):
            raise refuse(request, 409, NOT_WHERE_COMMANDED)
        return replace(live, verified=True)
    return live


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
    ee_pose = saved_hand_pose(request, payload.ee_pose.to_pose()) if payload.ee_pose is not None else None

    def make(name: str) -> JointPose:
        return JointPose(
            name=name,
            joint_names=tuple(payload.joint_names),
            positions=tuple(payload.positions),
            description=payload.description,
            ee_pose=ee_pose,
        )

    try:
        pose = library.create(make(payload.name)) if payload.name else library.create_numbered(make)
    except PositionExistsError as exc:
        raise refuse(request, 409, str(exc), payload.name or "") from exc
    except PositionLibraryError as exc:
        raise refuse(request, 422, str(exc), payload.name or "") from exc
    return to_position_response(pose)


def refuse_while_going(request: Request, config_id: str, app_id: str, name: str) -> None:
    active = request.app.state.go_to_monitor.active_name(config_id, app_id)
    if active is not None and active == normalize_pose_name(name):
        raise refuse(request, 409, f"'{active}' is being gone to: cancel the pose first.", active)


@router.delete("/positions/{name}", response_model=SavedPositionListResponse)
def delete_position(
    name: str,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_operator),
) -> SavedPositionListResponse:
    refuse_while_going(request, config_id, app_id, name)
    library = find_position_library(request, config_id, app_id)
    if library is None or not library.remove(name):
        raise refuse(request, 404, f"no saved position named '{name}'", name)
    return SavedPositionListResponse(positions=tuple(to_position_response(p) for p in library.list()))


@router.put("/positions/{name}/name", response_model=SavedPositionListResponse)
def rename_position(
    name: str,
    payload: SavedPositionRenameRequest,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_operator),
) -> SavedPositionListResponse:
    """A name is a label and an export key, never a command: renaming needs an operator, not the robot."""
    refuse_while_going(request, config_id, app_id, name)
    library = find_position_library(request, config_id, app_id)
    if library is None or library.get(normalize_pose_name(name)) is None:
        raise refuse(request, 404, f"no saved position named '{name}'", name)
    library = get_position_library_for_write(request, config_id, app_id)
    try:
        library.rename(normalize_pose_name(name), payload.name)
    except PositionLibraryError as exc:
        raise refuse(request, 409, str(exc), name) from exc
    return SavedPositionListResponse(positions=tuple(to_position_response(p) for p in library.list()))


def app_offers_go_to(request: Request, config_id: str, app_id: str) -> bool:
    application = find_runtime_application(request, config_id, app_id)
    return application is not None and any(
        widget.kind == "position-library" and widget.settings.get("go_to") is True
        for screen in application.screens
        for widget in screen.widgets
    )


@router.post("/positions/{name}/go", response_model=PoseTargetResponse)
def go_to_position(
    name: str,
    payload: GoToRequest,
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> PoseTargetResponse:
    """Send a saved hand pose to cartesian_manager's pose target, as the robot's owner.

    The only way a pose target leaves Bloom: the generic publish refuses the topic. The manager starts
    behaviour/pose_target at once and returns to passthrough within tolerance; STOP, Cancel, a departing session
    and the server's watchdog send passthrough earlier. The target is qontrol's commanded pose as saved.
    """
    stop_reason = request.app.state.runtime_stop_controller.rejection_reason()
    if stop_reason is not None:
        raise refuse(request, 409, stop_reason, name)
    session_id = request.headers.get(RUNTIME_SESSION_HEADER, "").strip()
    manager = request.app.state.runtime_session_manager
    if session_id and manager.app_context(session_id) != (config_id, app_id):
        raise refuse(request, 409, "This tablet runs another app: a Go to names a pose of the app it runs.", name)
    if not app_offers_go_to(request, config_id, app_id):
        raise refuse(request, 403, f"'{app_id}' offers no Go to: none of its position libraries has Go to on.", name)
    library = find_position_library(request, config_id, app_id)
    pose = library.get(normalize_pose_name(name)) if library is not None else None
    if pose is None:
        raise refuse(request, 404, f"no saved position named '{name}'", name)
    if pose.ee_pose is None:
        raise refuse(request, 422, f"'{pose.name}' was saved without the hand's pose; save it again to go to it", name)
    if payload.fingerprint != hand_pose_fingerprint(pose.ee_pose):
        raise refuse(request, 409, f"'{pose.name}' changed since it was shown: look at it again and press Go to.", name)
    facts = manager_facts(request)
    if facts.base_frame is None:
        raise refuse(
            request,
            409,
            "cartesian_manager has not reported its base frame (frames.base_frame) yet: Go to waits for it.",
            name,
        )
    # The manager drops a pose in any other frame without a word; refusing here says why.
    if bare_frame(pose.ee_pose.frame_id) != facts.base_frame:
        raise refuse(
            request,
            422,
            f"'{pose.name}' was saved in frame '{pose.ee_pose.frame_id}', but cartesian_manager takes a pose "
            f"target only in its base frame '{facts.base_frame}'",
            name,
        )
    reach = request.app.state.settings.max_hand_reach_m
    if math.hypot(*pose.ee_pose.position) > reach:
        raise refuse(request, 422, f"'{pose.name}' is farther than {reach:.2f} m from the base.", name)
    live_joints = request.app.state.command_state_tracker.live_joint_names(LIVE_SAMPLE_SEC)
    if live_joints is None:
        raise refuse(request, 409, "No live joint state: Go to waits until the arm reports its joints.", name)
    missing = [joint for joint in pose.joint_names if joint not in live_joints]
    if missing:
        raise refuse(
            request, 409, f"'{pose.name}' was saved on another arm: this one has no {', '.join(missing)}.", name
        )

    target = replace(pose.ee_pose, frame_id=facts.base_frame)
    go_policy = replace(
        get_runtime_command_policy(request),
        allowed_publish_topics=(facts.pose_target_topic,),
        allowed_message_types=(POSE_TARGET_MESSAGE_TYPE,),
    )
    require_owner = request.app.state.settings.runtime_control_required

    def on_published(session: str) -> None:
        # Like a joint target, a pose target outlives its sender: passthrough when the session leaves.
        manager.record_pose_target(session, facts.mode_topic, require_owner=require_owner)
        request.app.state.go_to_monitor.start(
            pose.name, config_id, app_id, target, facts.mode_topic, facts.linear_speed, facts.angular_speed
        )

    receipt = publish_as_runtime_owner(
        request,
        facts.pose_target_topic,
        POSE_TARGET_MESSAGE_TYPE,
        lambda: pose_target_payload(target),
        lambda: go_policy,
        on_published,
    )
    return PoseTargetResponse(name=pose.name, topic=receipt.topic, status=receipt.status, detail=receipt.detail)


@router.post("/positions/cancel", response_model=CancelResponse)
def cancel_go_to(
    request: Request,
    _principal: BloomPrincipal = Depends(require_runtime_owner),
) -> CancelResponse:
    """The library's own way out of a Go to: passthrough on the manager's mode topic, allowed while stopped."""
    facts = manager_facts(request)
    stop_controller = request.app.state.runtime_stop_controller
    session_id = request.headers.get(RUNTIME_SESSION_HEADER, "").strip()

    def cancel() -> str:
        detail = stop_controller.publish_mode_reset(facts.mode_topic, PASSTHROUGH_MODE)
        request.app.state.runtime_session_manager.record_mode_request(session_id, PASSTHROUGH_MODE, facts.mode_topic)
        return detail

    try:
        detail = execute_as_runtime_owner(request, cancel)
    except RuntimeError as exc:
        raise refuse(request, 503, str(exc)) from exc
    get_runtime_audit_log(request).record(
        RuntimeAuditRecord(channel="runtime_positions", detail=detail, session_id=session_id, status="accepted")
    )
    return CancelResponse(detail=detail)


@router.get("/positions/export", response_model=SavedPositionExportResponse)
def export_positions(
    request: Request,
    app_id: str = "",
    config_id: str = "",
    _principal: BloomPrincipal = Depends(require_observer),
) -> SavedPositionExportResponse:
    """Render the joint_targets block, and the pose_targets block for saved hand poses, for cartesian_manager.

    A joint target reaches the manager only by name, so it needs this export and a restart; Go to does not.
    """
    library = find_position_library(request, config_id, app_id)
    poses = library.list() if library is not None else ()
    try:
        blocks = [render_joint_targets_yaml(poses), render_pose_targets_yaml(poses)]
    except PositionLibraryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SavedPositionExportResponse(
        yaml="\n".join(block for block in blocks if block),
        target_names=tuple(pose.name for pose in poses),
    )
