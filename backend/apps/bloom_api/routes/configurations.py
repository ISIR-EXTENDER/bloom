from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
from threading import Lock
from typing import Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from apps.bloom_api.routes.configuration_bundles import (
    get_configuration_bundle,
    get_configuration_repository,
    try_get_configuration_bundle,
)
from apps.bloom_api.routes.theme_assets import cleanup_unreferenced_theme_assets
from apps.bloom_api.routes.theme_assets import router as theme_assets_router
from apps.bloom_api.security import BloomPrincipal, require_admin, require_observer
from libs.config import (
    ApplicationConfig,
    ApplicationNotFoundError,
    ConfigurationBundle,
    ConfigurationEditError,
    ConfigurationNotFoundError,
    ScreenConfig,
    ScreenNotFoundError,
    delete_application,
    delete_screen,
    list_reusable_screens,
    upsert_application,
    upsert_screen,
)

router = APIRouter(prefix="/configurations", tags=["configurations"])
T = TypeVar("T")


class ConfigurationListResponse(BaseModel):
    configuration_ids: list[str]


class ApplicationListResponse(BaseModel):
    applications: list[ApplicationConfig]


class ReusableScreenResponse(BaseModel):
    screen: ScreenConfig
    source_application_id: str
    source_application_name: str


class ReusableScreensResponse(BaseModel):
    screens: list[ReusableScreenResponse]


@dataclass
class _ConfigurationLock:
    lock: Lock
    holders: int = 0


_configuration_locks: dict[str, _ConfigurationLock] = {}
_configuration_locks_guard = Lock()


def serialized_per_configuration(route: Callable[..., T]) -> Callable[..., T]:
    """Each save reads, edits and writes the whole bundle, so two at once would drop one edit."""

    @wraps(route)
    def locked_route(*args: Any, **kwargs: Any) -> T:
        config_id = kwargs["config_id"]
        with _configuration_locks_guard:
            entry = _configuration_locks.setdefault(config_id, _ConfigurationLock(lock=Lock()))
            entry.holders += 1
        try:
            with entry.lock:
                return route(*args, **kwargs)
        finally:
            # Kept only while someone holds or waits for it, so an id nobody
            # saves any more leaves no lock behind.
            with _configuration_locks_guard:
                entry.holders -= 1
                if entry.holders == 0:
                    _configuration_locks.pop(config_id, None)

    return locked_route


@router.get("", response_model=ConfigurationListResponse)
def list_configurations(
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> ConfigurationListResponse:
    repository = get_configuration_repository(request)
    return ConfigurationListResponse(configuration_ids=repository.list_ids())


@router.get("/{config_id}", response_model=ConfigurationBundle)
def get_configuration(
    config_id: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> ConfigurationBundle:
    repository = get_configuration_repository(request)
    try:
        return repository.get(config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc


@router.put("/{config_id}", response_model=ConfigurationBundle)
@serialized_per_configuration
def upsert_configuration(
    config_id: str,
    bundle: ConfigurationBundle,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> ConfigurationBundle:
    repository = get_configuration_repository(request)
    previous_bundle = try_get_configuration_bundle(config_id, request)
    updated_bundle = repository.upsert(config_id, bundle)
    cleanup_unreferenced_theme_assets(config_id, previous_bundle, updated_bundle, request)
    return updated_bundle


@router.get("/{config_id}/applications", response_model=ApplicationListResponse)
def list_applications(
    config_id: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> ApplicationListResponse:
    bundle = get_configuration_bundle(config_id, request)
    return ApplicationListResponse(applications=list(bundle.applications))


@router.put("/{config_id}/applications/{application_id}", response_model=ConfigurationBundle)
@serialized_per_configuration
def upsert_configuration_application(
    config_id: str,
    application_id: str,
    application: ApplicationConfig,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> ConfigurationBundle:
    if application.id != application_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="application id does not match path")

    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    updated_bundle = upsert_application(bundle, application)
    saved_bundle = repository.upsert(config_id, updated_bundle)
    cleanup_unreferenced_theme_assets(config_id, bundle, saved_bundle, request)
    return saved_bundle


@router.delete("/{config_id}/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
@serialized_per_configuration
def delete_configuration_application(
    config_id: str,
    application_id: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> Response:
    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    try:
        updated_bundle = delete_application(bundle, application_id)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="application not found") from exc
    repository.upsert(config_id, updated_bundle)
    cleanup_unreferenced_theme_assets(config_id, bundle, updated_bundle, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{config_id}/screens", response_model=ReusableScreensResponse)
def list_configuration_screens(
    config_id: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> ReusableScreensResponse:
    bundle = get_configuration_bundle(config_id, request)
    return ReusableScreensResponse(
        screens=[
            ReusableScreenResponse(
                screen=reusable_screen.screen,
                source_application_id=reusable_screen.source_application_id,
                source_application_name=reusable_screen.source_application_name,
            )
            for reusable_screen in list_reusable_screens(bundle)
        ]
    )


@router.put("/{config_id}/applications/{application_id}/screens/{screen_id}", response_model=ConfigurationBundle)
@serialized_per_configuration
def upsert_configuration_screen(
    config_id: str,
    application_id: str,
    screen_id: str,
    screen: ScreenConfig,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> ConfigurationBundle:
    if screen.id != screen_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="screen id does not match path")

    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    try:
        updated_bundle = upsert_screen(bundle, application_id, screen)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="application not found") from exc
    saved_bundle = repository.upsert(config_id, updated_bundle)
    cleanup_unreferenced_theme_assets(config_id, bundle, saved_bundle, request)
    return saved_bundle


@router.delete("/{config_id}/applications/{application_id}/screens/{screen_id}", status_code=status.HTTP_204_NO_CONTENT)
@serialized_per_configuration
def delete_configuration_screen(
    config_id: str,
    application_id: str,
    screen_id: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> Response:
    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    try:
        updated_bundle = delete_screen(bundle, application_id, screen_id)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="application not found") from exc
    except ScreenNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="screen not found") from exc
    except ConfigurationEditError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    repository.upsert(config_id, updated_bundle)
    cleanup_unreferenced_theme_assets(config_id, bundle, updated_bundle, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
@serialized_per_configuration
def delete_configuration(
    config_id: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> Response:
    repository = get_configuration_repository(request)
    previous_bundle = try_get_configuration_bundle(config_id, request)
    try:
        repository.delete(config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc
    cleanup_unreferenced_theme_assets(config_id, previous_bundle, None, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


router.include_router(theme_assets_router)
