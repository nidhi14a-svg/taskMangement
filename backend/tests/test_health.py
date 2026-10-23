from fastapi.testclient import TestClient
from app.core.config import settings


def test_root_health_endpoint(client: TestClient):
    """Test that GET /health returns 200 and expected schema fields."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["app_name"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION
    assert data["environment"] == settings.ENVIRONMENT
    assert "database" in data
    assert "timestamp" in data


def test_api_v1_health_endpoint(client: TestClient):
    """Test that GET /api/v1/health returns 200 under the consistent /api/v1 prefix."""
    response = client.get(f"{settings.API_V1_STR}/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["app_name"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION


def test_root_metadata_endpoint(client: TestClient):
    """Test that root endpoint GET / provides service discovery links."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == settings.PROJECT_NAME
    assert data["health_check"] == "/health"
    assert data["api_v1"] == settings.API_V1_STR


def test_settings_configuration():
    """Test that settings load properly with default values."""
    assert settings.PROJECT_NAME == "TaskFlow Management API"
    assert settings.API_V1_STR == "/api/v1"
    assert settings.ENVIRONMENT in ["development", "production", "test"]
    assert settings.SECRET_KEY is not None
