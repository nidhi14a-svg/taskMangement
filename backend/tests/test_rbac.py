import uuid
from bson import ObjectId
from fastapi.testclient import TestClient
import jwt
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.models.enums import UserRole, TaskStatus, TaskPriority
from app.models.user import INVITATIONS_COLLECTION
from scripts.create_admin import provision_admin
import asyncio


def get_random_email() -> str:
    return f"rbac_{uuid.uuid4().hex[:8]}@example.com"


def register_user(client: TestClient, role: str = "EMPLOYEE", invite_code: str = None, department: str = "Engineering", position: str = "Developer") -> tuple[str, str, dict]:
    email = get_random_email()
    password = "SecurePassword123!"
    payload = {
        "name": f"User {role}",
        "email": email,
        "password": password,
        "role": role,
        "department": department,
        "position": position,
    }
    if invite_code:
        payload["invite_code"] = invite_code

    reg_resp = client.post("/api/v1/auth/register", json=payload)
    if reg_resp.status_code != 201:
        return email, "", reg_resp.json()

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    user = login_resp.json()["user"]
    return email, token, user


def test_rbac_registration_permitted_roles(client: TestClient):
    """Test registration for EMPLOYEE and TEAM_LEAD (with invite code)."""
    # 1. Register as EMPLOYEE
    _, emp_token, emp_user = register_user(client, role="EMPLOYEE", department="Engineering", position="Frontend Engineer")
    assert emp_token != ""
    assert emp_user["role"] == "EMPLOYEE"
    assert emp_user["department"] == "Engineering"
    assert emp_user["position"] == "Frontend Engineer"

    # 2. Register as TEAM_LEAD with valid system code
    _, lead_token, lead_user = register_user(
        client,
        role="TEAM_LEAD",
        invite_code=settings.TEAM_LEAD_INVITE_CODE,
        department="Engineering",
        position="Engineering Manager",
    )
    assert lead_token != ""
    assert lead_user["role"] == "TEAM_LEAD"
    assert lead_user["department"] == "Engineering"


def test_rbac_self_register_as_admin_rejected(client: TestClient):
    """Test that public self-registration with role ADMIN returns HTTP 403 Forbidden."""
    email = get_random_email()
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Attacker",
            "email": email,
            "password": "Password123!",
            "role": "ADMIN",
        },
    )
    assert resp.status_code == 403
    assert "admin" in resp.json()["detail"].lower()


def test_rbac_team_lead_registration_requires_invite_code(client: TestClient):
    """Test that registering as TEAM_LEAD without or with invalid invite code returns 403."""
    # Missing invite code
    resp1 = client.post(
        "/api/v1/auth/register",
        json={
            "name": "No Code Lead",
            "email": get_random_email(),
            "password": "Password123!",
            "role": "TEAM_LEAD",
        },
    )
    assert resp1.status_code == 403
    assert "invitation code" in resp1.json()["detail"].lower()

    # Invalid invite code
    resp2 = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Bad Code Lead",
            "email": get_random_email(),
            "password": "Password123!",
            "role": "TEAM_LEAD",
            "invite_code": "INVALID-CODE-XYZ",
        },
    )
    assert resp2.status_code == 403
    assert "invalid or expired" in resp2.json()["detail"].lower()


def test_rbac_invalid_and_expired_jwts(client: TestClient):
    """Test API rejects invalid and expired JWT tokens with HTTP 401 Unauthorized."""
    # 1. Invalid signature token
    fake_token = jwt.encode(
        {"sub": str(ObjectId()), "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "wrong_secret_key_12345678901234567890",
        algorithm="HS256",
    )
    resp1 = client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {fake_token}"})
    assert resp1.status_code == 401

    # 2. Expired token (include iat so it passes required claims check and triggers expired error)
    now = datetime.now(timezone.utc)
    expired_token = jwt.encode(
        {
            "sub": str(ObjectId()),
            "exp": now - timedelta(hours=1),
            "iat": now - timedelta(hours=2),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    resp2 = client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {expired_token}"})
    assert resp2.status_code == 401
    assert "expired" in resp2.json()["detail"].lower()


def test_rbac_direct_api_access_unauthorized_roles(client: TestClient):
    """Test direct access to Admin-only endpoints returns 403 Forbidden for non-admins."""
    _, emp_token, _ = register_user(client, role="EMPLOYEE")
    _, lead_token, _ = register_user(client, role="TEAM_LEAD", invite_code=settings.TEAM_LEAD_INVITE_CODE)

    # EMPLOYEE tries to access admin-check
    resp1 = client.get("/api/v1/auth/admin-check", headers={"Authorization": f"Bearer {emp_token}"})
    assert resp1.status_code == 403

    # TEAM_LEAD tries to access admin-check
    resp2 = client.get("/api/v1/auth/admin-check", headers={"Authorization": f"Bearer {lead_token}"})
    assert resp2.status_code == 403

    # EMPLOYEE tries to update another user
    resp3 = client.patch(
        f"/api/v1/users/{ObjectId()}",
        json={"role": "ADMIN"},
        headers={"Authorization": f"Bearer {emp_token}"},
    )
    assert resp3.status_code == 403


def test_rbac_team_lead_access_permitted_vs_non_permitted_employees(client: TestClient):
    """Test TEAM_LEAD can only view and assign to members of their department."""
    # Setup team lead in Engineering
    _, lead_token, lead_user = register_user(
        client, role="TEAM_LEAD", invite_code=settings.TEAM_LEAD_INVITE_CODE, department="Engineering"
    )

    # Member in same department (Engineering)
    _, emp_eng_token, emp_eng = register_user(client, role="EMPLOYEE", department="Engineering")
    eng_id = emp_eng.get("_id") or emp_eng.get("id")

    # Member in different department (Marketing)
    _, emp_mkt_token, emp_mkt = register_user(client, role="EMPLOYEE", department="Marketing")
    mkt_id = emp_mkt.get("_id") or emp_mkt.get("id")

    # Team lead lists users -> should see Engineering members, NOT Marketing
    users_resp = client.get("/api/v1/users", headers={"Authorization": f"Bearer {lead_token}"})
    assert users_resp.status_code == 200
    user_ids = [u.get("_id") or u.get("id") for u in users_resp.json()]
    assert eng_id in user_ids
    assert mkt_id not in user_ids

    # Team lead assigns task to Engineering member -> succeeds
    task_ok_resp = client.post(
        "/api/v1/tasks",
        json={"title": "Team Task Ok", "assignee_id": eng_id},
        headers={"Authorization": f"Bearer {lead_token}"},
    )
    assert task_ok_resp.status_code == 201

    # Team lead attempts to assign task to Marketing member -> 403 Forbidden
    task_fail_resp = client.post(
        "/api/v1/tasks",
        json={"title": "Team Task Forbidden", "assignee_id": mkt_id},
        headers={"Authorization": f"Bearer {lead_token}"},
    )
    assert task_fail_resp.status_code == 403
    assert "team" in task_fail_resp.json()["detail"].lower()


def test_rbac_employee_restricted_task_access(client: TestClient):
    """Test employee cannot delete tasks created by others and can only update status when assigned."""
    _, creator_token, creator = register_user(client, role="EMPLOYEE", department="Engineering")
    _, assignee_token, assignee = register_user(client, role="EMPLOYEE", department="Engineering")
    _, bystander_token, _ = register_user(client, role="EMPLOYEE", department="Marketing")
    assignee_id = assignee.get("_id") or assignee.get("id")

    # Creator creates task assigned to assignee
    create_resp = client.post(
        "/api/v1/tasks",
        json={"title": "Deliverable Alpha", "assignee_id": assignee_id},
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    task_data = create_resp.json()
    task_id = task_data.get("_id") or task_data.get("id")

    # Bystander tries to view task -> 403 Forbidden
    view_resp = client.get(f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {bystander_token}"})
    assert view_resp.status_code == 403

    # Assignee tries to modify title -> 403 Forbidden
    edit_title_resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert edit_title_resp.status_code == 403
    assert "task status" in edit_title_resp.json()["detail"].lower()

    # Assignee updates status -> Succeeds
    status_resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "IN_PROGRESS"},
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "IN_PROGRESS"

    # Assignee tries to delete task -> 403 Forbidden
    delete_resp = client.delete(f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {assignee_token}"})
    assert delete_resp.status_code == 403
