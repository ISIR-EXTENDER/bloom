from fastapi import APIRouter

from apps.bloom_api.routes.configurations import router as configurations_router
from apps.bloom_api.routes.ros import router as ros_router
from apps.bloom_api.routes.runtime import router as runtime_router
from apps.bloom_api.routes.system import router as system_router

api_router = APIRouter()
api_router.include_router(system_router, tags=["system"])
api_router.include_router(configurations_router)
api_router.include_router(ros_router)
api_router.include_router(runtime_router)
