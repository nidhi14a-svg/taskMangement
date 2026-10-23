import uuid
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi.testclient import TestClient
import asyncio

from app.models.enums import TaskStatus, TaskPriority, UserRole
from scripts.create_admin import provision_admin


def get_random_email() -> str:
    return f"dashuser_{uuid.uuid4().hex[:10]}@example.com"


def create_test_user(client: TestClient, name: str = "Dash User") -> tuple[str, str, dict]:
    """Registers and authenticates a test user, returning (email, token, user_dict)."""
    email = get_random_email()
    password = "UserPassword123!"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert reg_resp.status_code == 201

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    user_data = login_resp.json()["user"]
    return email, token, user_data


def create_test_admin(client: TestClient) -> tuple[str, str, dict]:
    """Provisions and authenticates an admin user."""
    admin_email = get_random_email()
    admin_password = "AdminPassword123!"
    asyncio.run(
        provision_admin(
            name="Dash Admin",
            email=admin_email,
            password=admin_password,
        )
    )
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": admin_email, "password": admin_password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    admin_data = login_resp.json()["user"]
    return admin_email, token, admin_data


# ==============================================================================
# DASHBOARD SUMMARY TESTS (GET /api/v1/dashboard/summary)
# ==============================================================================


def test_dashboard_summary_unauthenticated(client: TestClient):
    """Test unauthenticated request to /dashboard/summary returns HTTP 401."""
    resp = client.get("/api/v1/dashboard/summary")
    assert resp.status_code == 401


def test_dashboard_summary_empty_state(client: TestClient):
    """Test dashboard metrics for a newly registered user with zero tasks."""
    _, token, _ = create_test_user(client, "Fresh User")

    resp = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_tasks"] == 0
    assert data["pending_tasks"] == 0
    assert data["completed_tasks"] == 0
    assert data["overdue_tasks"] == 0
    assert data["completion_rate"] == 0.0

    # Ensure all breakdown keys are present with 0
    assert data["status_breakdown"] == {"TODO": 0, "IN_PROGRESS": 0, "COMPLETED": 0}
    assert data["priority_breakdown"] == {"LOW": 0, "MEDIUM": 0, "HIGH": 0}


def test_dashboard_summary_calculation_accuracy(client: TestClient):
    """
    Test metric calculations:
    - Task 1: TODO, past due_date -> pending (+1), overdue (+1)
    - Task 2: IN_PROGRESS, future due_date -> pending (+1), not overdue
    - Task 3: COMPLETED, past due_date -> completed (+1), not overdue (because completed)
    - Task 4: TODO, no due_date -> pending (+1), not overdue
    Total = 4, Completed = 1, Pending = 3, Overdue = 1, Completion Rate = 25.0%
    """
    _, token, _ = create_test_user(client, "Metric Tester")

    now = datetime.now(timezone.utc)
    past_date = (now - timedelta(days=2)).isoformat()
    future_date = (now + timedelta(days=3)).isoformat()

    # Task 1: Overdue TODO
    client.post(
        "/api/v1/tasks",
        json={"title": "Overdue Task", "status": "TODO", "priority": "HIGH", "due_date": past_date},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Task 2: In-progress Future
    client.post(
        "/api/v1/tasks",
        json={"title": "In Progress Task", "status": "IN_PROGRESS", "priority": "MEDIUM", "due_date": future_date},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Task 3: Completed with past date (must NOT be counted as overdue)
    client.post(
        "/api/v1/tasks",
        json={"title": "Completed Task", "status": "COMPLETED", "priority": "LOW", "due_date": past_date},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Task 4: No due date
    client.post(
        "/api/v1/tasks",
        json={"title": "No Due Date Task", "status": "TODO", "priority": "LOW"},
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_tasks"] == 4
    assert data["pending_tasks"] == 3
    assert data["completed_tasks"] == 1
    assert data["overdue_tasks"] == 1
    assert data["completion_rate"] == 25.0

    assert data["status_breakdown"]["TODO"] == 2
    assert data["status_breakdown"]["IN_PROGRESS"] == 1
    assert data["status_breakdown"]["COMPLETED"] == 1

    assert data["priority_breakdown"]["HIGH"] == 1
    assert data["priority_breakdown"]["MEDIUM"] == 1
    assert data["priority_breakdown"]["LOW"] == 2


def test_dashboard_summary_no_double_counting(client: TestClient):
    """
    Test that when a user creates a task and assigns it to themselves,
    the task is counted exactly ONCE in total_tasks and breakdowns.
    """
    _, token, user_data = create_test_user(client, "Self Assigner")
    user_id = user_data.get("_id") or user_data.get("id")

    # Create task assigned to self
    client.post(
        "/api/v1/tasks",
        json={"title": "Self Assigned Task", "status": "TODO", "priority": "HIGH", "assignee_id": user_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    resp = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Must be 1, not 2
    assert data["total_tasks"] == 1
    assert data["pending_tasks"] == 1
    assert data["status_breakdown"]["TODO"] == 1


def test_dashboard_summary_user_scoping_vs_admin_global(client: TestClient):
    """
    Test user scoping vs admin global statistics:
    - User A creates 2 tasks.
    - User B creates 3 tasks.
    - User A dashboard sees total_tasks == 2.
    - User B dashboard sees total_tasks == 3.
    - Admin dashboard sees global total_tasks >= 5.
    """
    _, user_a_token, _ = create_test_user(client, "User A")
    _, user_b_token, _ = create_test_user(client, "User B")
    _, admin_token, _ = create_test_admin(client)

    # User A: 2 completed tasks
    for i in range(2):
        client.post(
            "/api/v1/tasks",
            json={"title": f"A Task {i}", "status": "COMPLETED"},
            headers={"Authorization": f"Bearer {user_a_token}"},
        )

    # User B: 3 pending tasks
    for i in range(3):
        client.post(
            "/api/v1/tasks",
            json={"title": f"B Task {i}", "status": "TODO"},
            headers={"Authorization": f"Bearer {user_b_token}"},
        )

    # Check User A
    data_a = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {user_a_token}"},
    ).json()
    assert data_a["total_tasks"] == 2
    assert data_a["completed_tasks"] == 2
    assert data_a["completion_rate"] == 100.0

    # Check User B
    data_b = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {user_b_token}"},
    ).json()
    assert data_b["total_tasks"] == 3
    assert data_b["completed_tasks"] == 0
    assert data_b["pending_tasks"] == 3
    assert data_b["completion_rate"] == 0.0

    # Check Admin (global organization-wide)
    data_admin = client.get(
        "/api/v1/dashboard/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    assert data_admin["total_tasks"] >= 5
    assert data_admin["completed_tasks"] >= 2
    assert data_admin["pending_tasks"] >= 3
