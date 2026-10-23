from datetime import datetime
from pydantic import BaseModel, ConfigDict


class HealthCheckResponse(BaseModel):
    """Schema for health-check endpoint responses."""

    status: str
    app_name: str
    version: str
    environment: str
    database: str
    timestamp: datetime

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "status": "healthy",
                "app_name": "TaskFlow Management API",
                "version": "1.0.0",
                "environment": "development",
                "database": "connected",
                "timestamp": "2026-10-22T15:00:00Z",
            }
        },
    )
