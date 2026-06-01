from fastapi import APIRouter, Request
from pydantic import BaseModel

from apps.bloom_api.settings import Settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        environment=settings.environment,
    )

