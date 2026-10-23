from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import settings
from app.core.database import check_mongo_connection
from app.schemas.health import HealthCheckResponse
from app.api.v1.endpoints import auth, users, tasks, dashboard

api_router = APIRouter()


@api_router.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="API v1 Health Check",
    tags=["System"],
)
async def api_v1_health() -> HealthCheckResponse:
    """Returns the operational status of the API v1 service and database connectivity."""
    db_ok, db_status = await check_mongo_connection()
    return HealthCheckResponse(
        status="healthy" if db_ok else "degraded",
        app_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        database=db_status,
        timestamp=datetime.now(timezone.utc),
    )


# Mount feature routers under /api/v1
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
