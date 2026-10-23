from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection, check_mongo_connection
from app.schemas.health import HealthCheckResponse
from app.api.v1.api import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan manager.
    Initializes PyMongo AsyncMongoClient, connects to MongoDB, and verifies collection indexes.
    Closes the async connection pool cleanly upon application shutdown.
    """
    await connect_to_mongo(app)
    yield
    await close_mongo_connection(app)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Production-style Task Management System API with MongoDB",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# Set up CORS middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="Root Health Check",
    tags=["System"],
)
async def root_health() -> HealthCheckResponse:
    """
    Health check endpoint at GET /health.
    Reports operational status and MongoDB connectivity without exposing credentials.
    """
    db_ok, db_status = await check_mongo_connection()
    return HealthCheckResponse(
        status="healthy" if db_ok else "degraded",
        app_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        database=db_status,
        timestamp=datetime.now(timezone.utc),
    )


@app.get("/", tags=["System"])
def root():
    """Root endpoint providing service metadata."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "health_check": "/health",
        "api_v1": settings.API_V1_STR,
        "docs": f"{settings.API_V1_STR}/docs",
    }


# Include /api/v1 application endpoints
app.include_router(api_router, prefix=settings.API_V1_STR)
