from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel

from libs.config import (
    ApplicationConfig,
    ApplicationNotFoundError,
    ConfigurationBundle,
    ConfigurationEditError,
    ConfigurationNotFoundError,
    ConfigurationRepository,
    ScreenConfig,
    ScreenNotFoundError,
    delete_application,
    delete_screen,
    list_reusable_screens,
    upsert_application,
    upsert_screen,
)

router = APIRouter(prefix="/configurations", tags=["configurations"])


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


def get_configuration_repository(request: Request) -> ConfigurationRepository:
    return request.app.state.configuration_repository


@router.get("", response_model=ConfigurationListResponse)
def list_configurations(request: Request) -> ConfigurationListResponse:
    repository = get_configuration_repository(request)
    return ConfigurationListResponse(configuration_ids=repository.list_ids())


@router.get("/{config_id}", response_model=ConfigurationBundle)
def get_configuration(config_id: str, request: Request) -> ConfigurationBundle:
    repository = get_configuration_repository(request)
    try:
        return repository.get(config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc


@router.put("/{config_id}", response_model=ConfigurationBundle)
def upsert_configuration(config_id: str, bundle: ConfigurationBundle, request: Request) -> ConfigurationBundle:
    repository = get_configuration_repository(request)
    return repository.upsert(config_id, bundle)


@router.get("/{config_id}/applications", response_model=ApplicationListResponse)
def list_applications(config_id: str, request: Request) -> ApplicationListResponse:
    bundle = get_configuration_bundle(config_id, request)
    return ApplicationListResponse(applications=list(bundle.applications))


@router.put("/{config_id}/applications/{application_id}", response_model=ConfigurationBundle)
def upsert_configuration_application(
    config_id: str,
    application_id: str,
    application: ApplicationConfig,
    request: Request,
) -> ConfigurationBundle:
    if application.id != application_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="application id does not match path")

    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    updated_bundle = upsert_application(bundle, application)
    return repository.upsert(config_id, updated_bundle)


@router.delete("/{config_id}/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_configuration_application(config_id: str, application_id: str, request: Request) -> Response:
    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    try:
        updated_bundle = delete_application(bundle, application_id)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="application not found") from exc
    repository.upsert(config_id, updated_bundle)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{config_id}/screens", response_model=ReusableScreensResponse)
def list_configuration_screens(config_id: str, request: Request) -> ReusableScreensResponse:
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
def upsert_configuration_screen(
    config_id: str,
    application_id: str,
    screen_id: str,
    screen: ScreenConfig,
    request: Request,
) -> ConfigurationBundle:
    if screen.id != screen_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="screen id does not match path")

    repository = get_configuration_repository(request)
    bundle = get_configuration_bundle(config_id, request)
    try:
        updated_bundle = upsert_screen(bundle, application_id, screen)
    except ApplicationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="application not found") from exc
    return repository.upsert(config_id, updated_bundle)


@router.delete("/{config_id}/applications/{application_id}/screens/{screen_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_configuration_screen(config_id: str, application_id: str, screen_id: str, request: Request) -> Response:
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_configuration(config_id: str, request: Request) -> Response:
    repository = get_configuration_repository(request)
    try:
        repository.delete(config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def get_configuration_bundle(config_id: str, request: Request) -> ConfigurationBundle:
    repository = get_configuration_repository(request)
    try:
        return repository.get(config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc
