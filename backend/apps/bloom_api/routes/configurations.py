from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel

from libs.config import ConfigurationBundle, ConfigurationNotFoundError, InMemoryConfigurationRepository

router = APIRouter(prefix="/configurations", tags=["configurations"])


class ConfigurationListResponse(BaseModel):
    configuration_ids: list[str]


def get_configuration_repository(request: Request) -> InMemoryConfigurationRepository:
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


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_configuration(config_id: str, request: Request) -> Response:
    repository = get_configuration_repository(request)
    try:
        repository.delete(config_id)
    except ConfigurationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)

