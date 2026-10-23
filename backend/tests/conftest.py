import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def client():
    """Synchronous test client for API testing with active application lifespan."""
    with TestClient(app) as test_client:
        yield test_client
