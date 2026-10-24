import uuid
from datetime import datetime, timedelta, timezone
from bson import ObjectId
import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.enums import UserRole
from app.models.user import USERS_COLLECTION


def get_random_email() -> str:
    """Generates an isolated random email for idempotent test runs."""
    return f"testuser_{uuid.uuid4().hex[:10]}@example.com"


# ==============================================================================
# 1. REGISTRATION TESTS (POST /api/v1/auth/register)
# ==============================================================================


def test_register_success(client: TestClient):
    """
    Test public registration endpoint:
    - Accepts name, email, password.
    - Hashes password with Argon2id.
    - Default role is USER.
    - Safe public user fields returned (no password_hash).
    """
    email = get_random_email()
    payload = {
        "name": "Jane Developer",
        "email": email,
        "password": "SecurePassword123!",
    }

    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert "_id" in data or "id" in data
    assert data["name"] == "Jane Developer"
    assert data["email"] == email.lower()
    assert data["role"] in (UserRole.EMPLOYEE.value, UserRole.USER.value)
    assert "created_at" in data
    assert "updated_at" in data

    # Verify password hash and plaintext passwords are NEVER returned
    assert "password" not in data
    assert "password_hash" not in data


def test_register_duplicate_email_conflict(client: TestClient):
    """Test duplicate registration returns HTTP 409 Conflict."""
    email = get_random_email()
    payload = {
        "name": "Original User",
        "email": email,
        "password": "Password123!",
    }

    # First registration -> 201 Created
    first_resp = client.post("/api/v1/auth/register", json=payload)
    assert first_resp.status_code == 201

    # Second registration with exact same email -> 409 Conflict
    dup_resp = client.post("/api/v1/auth/register", json=payload)
    assert dup_resp.status_code == 409
    assert "already exists" in dup_resp.json()["detail"].lower()

    # Third registration with uppercase variation of same email -> 409 Conflict
    case_dup_payload = {
        "name": "Another User",
        "email": f"  {email.upper()}  ",
        "password": "DifferentPassword123!",
    }
    case_dup_resp = client.post("/api/v1/auth/register", json=case_dup_payload)
    assert case_dup_resp.status_code == 409
    assert "already exists" in case_dup_resp.json()["detail"].lower()


def test_register_cannot_create_admin(client: TestClient):
    """
    Test that attempts to self-register as ADMIN are strictly rejected with HTTP 403 Forbidden.
    """
    email = get_random_email()
    payload = {
        "name": "Sneaky User",
        "email": email,
        "password": "Password123!",
        "role": "ADMIN",  # Attempt privilege escalation
    }

    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 403
    assert "admin" in response.json()["detail"].lower()


def test_register_input_validation(client: TestClient):
    """Test validation errors for short password, blank name, and invalid email."""
    # Short password (< 8 chars)
    resp1 = client.post(
        "/api/v1/auth/register",
        json={"name": "Alice", "email": get_random_email(), "password": "short"},
    )
    assert resp1.status_code == 422

    # Blank name
    resp2 = client.post(
        "/api/v1/auth/register",
        json={"name": "   ", "email": get_random_email(), "password": "Password123!"},
    )
    assert resp2.status_code == 422

    # Invalid email format
    resp3 = client.post(
        "/api/v1/auth/register",
        json={"name": "Alice", "email": "not-an-email", "password": "Password123!"},
    )
    assert resp3.status_code == 422


# ==============================================================================
# 2. LOGIN TESTS (POST /api/v1/auth/login)
# ==============================================================================


def test_login_success(client: TestClient):
    """
    Test user login with valid credentials:
    - Returns HTTP 200 OK.
    - Returns signed JWT access token and token_type 'bearer'.
    - Returns safe public user info.
    """
    email = get_random_email()
    password = "ValidPassword123!"

    # Register user first
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Login Tester", "email": email, "password": password},
    )
    assert reg_resp.status_code == 201

    # Attempt login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200

    data = login_resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["email"] == email.lower()
    assert data["user"]["role"] in (UserRole.EMPLOYEE.value, UserRole.USER.value)
    assert "password_hash" not in data["user"]


def test_login_email_case_insensitivity(client: TestClient):
    """Test login normalizes email so uppercase input succeeds."""
    email = get_random_email()
    password = "ValidPassword123!"

    # Register with lowercase
    client.post(
        "/api/v1/auth/register",
        json={"name": "Case Tester", "email": email.lower(), "password": password},
    )

    # Login with uppercase and leading/trailing whitespace
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": f"  {email.upper()}  ", "password": password},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


def test_login_incorrect_password(client: TestClient):
    """Test login with incorrect password returns HTTP 401 Unauthorized."""
    email = get_random_email()
    password = "RealPassword123!"

    client.post(
        "/api/v1/auth/register",
        json={"name": "Wrong Pass Tester", "email": email, "password": password},
    )

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "WrongPassword999!"},
    )
    assert login_resp.status_code == 401
    assert "incorrect email or password" in login_resp.json()["detail"].lower()
    assert "www-authenticate" in login_resp.headers


def test_login_nonexistent_email(client: TestClient):
    """Test login with non-existent email returns HTTP 401 Unauthorized."""
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody_exists_here@example.com", "password": "Password123!"},
    )
    assert login_resp.status_code == 401
    assert "incorrect email or password" in login_resp.json()["detail"].lower()


# ==============================================================================
# 3. GET /api/v1/auth/me (PROTECTED CURRENT-USER PROFILE)
# ==============================================================================


def test_me_success_with_valid_token(client: TestClient):
    """Test GET /api/v1/auth/me returns current user's profile with valid token."""
    email = get_random_email()
    password = "MyPassword123!"

    # Register and login
    client.post(
        "/api/v1/auth/register",
        json={"name": "Profile Owner", "email": email, "password": password},
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    token = login_res.json()["access_token"]

    # Request /me
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["name"] == "Profile Owner"
    assert me_data["email"] == email.lower()
    assert me_data["role"] in (UserRole.EMPLOYEE.value, UserRole.USER.value)
    assert "password_hash" not in me_data


def test_me_missing_token_unauthorized(client: TestClient):
    """Test GET /api/v1/auth/me returns HTTP 401 when Authorization header is missing."""
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert "required" in resp.json()["detail"].lower()


def test_me_invalid_token_unauthorized(client: TestClient):
    """Test GET /api/v1/auth/me returns HTTP 401 when token is malformed or invalid."""
    # Malformed garbage token
    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt-token"},
    )
    assert resp.status_code == 401
    assert "invalid" in resp.json()["detail"].lower()

    # Token signed with wrong secret key
    fake_token = jwt.encode(
        {
            "sub": str(ObjectId()),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
            "iat": datetime.now(timezone.utc),
        },
        "wrong-secret-key-that-does-not-match-at-all!!",
        algorithm="HS256",
    )
    resp2 = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {fake_token}"},
    )
    assert resp2.status_code == 401
    assert "invalid" in resp2.json()["detail"].lower()


def test_me_expired_token_unauthorized(client: TestClient):
    """Test GET /api/v1/auth/me returns HTTP 401 when token has expired."""
    expired_token = create_access_token(
        subject=str(ObjectId()),
        expires_delta=timedelta(seconds=-10),  # expired 10 seconds ago
    )

    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


def test_me_nonexistent_user_token_unauthorized(client: TestClient):
    """Test token pointing to a non-existent ObjectId returns HTTP 401."""
    random_oid = ObjectId()
    token = create_access_token(subject=str(random_oid))

    resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401
    assert "no longer exists" in resp.json()["detail"].lower()


# ==============================================================================
# 4. AUTHORIZATION AND ROLE-BASED ACCESS CONTROL (RBAC)
# ==============================================================================


def test_admin_route_forbidden_for_regular_user(client: TestClient):
    """
    Test that a regular user (role == USER) cannot access admin routes.
    Must return HTTP 403 Forbidden.
    """
    email = get_random_email()
    password = "RegularUserPassword123!"

    # Register regular user
    client.post(
        "/api/v1/auth/register",
        json={"name": "Standard User", "email": email, "password": password},
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    user_token = login_res.json()["access_token"]

    # Attempt admin endpoint
    admin_resp = client.get(
        "/api/v1/auth/admin-check",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert admin_resp.status_code == 403
    assert "administrator permissions required" in admin_resp.json()["detail"].lower()


def test_admin_route_success_for_admin_user(client: TestClient):
    """
    Test that an administrator (role == ADMIN) can successfully access admin routes.
    Must return HTTP 200 OK.
    """
    import asyncio
    from scripts.create_admin import provision_admin

    admin_email = get_random_email()
    admin_password = "AdminPassword123!"

    # Provision admin user
    asyncio.run(
        provision_admin(
            name="Super Administrator",
            email=admin_email,
            password=admin_password,
        )
    )

    # Login as admin
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": admin_password},
    )
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]
    assert login_res.json()["user"]["role"] == UserRole.ADMIN.value

    # Access admin endpoint
    admin_resp = client.get(
        "/api/v1/auth/admin-check",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_resp.status_code == 200
    data = admin_resp.json()
    assert data["status"] == "authorized"
    assert data["role"] == UserRole.ADMIN.value
    assert "Super Administrator" in data["message"]


def test_admin_route_unauthenticated_returns_401(client: TestClient):
    """Test accessing admin route without any token returns HTTP 401 Unauthorized."""
    resp = client.get("/api/v1/auth/admin-check")
    assert resp.status_code == 401
    assert "required" in resp.json()["detail"].lower()
