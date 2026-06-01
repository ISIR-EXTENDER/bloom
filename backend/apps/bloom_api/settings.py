from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, Field


class Settings(BaseModel):
    app_name: str = "Bloom API"
    app_version: str = "0.1.0"
    app_description: str = "Configurable web interface backend for robot supervision and control."
    api_prefix: str = "/api/v1"
    service_name: str = "bloom-api"
    environment: Literal["local", "test", "staging", "production"] = Field(default="local")


@lru_cache
def get_settings() -> Settings:
    return Settings()
