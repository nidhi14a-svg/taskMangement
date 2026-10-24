import uuid
from fastapi.testclient import TestClient
from app.core.config import settings


def get_random_email() -> str:
    return f"notif_user_{uuid.uuid4().hex[:8]}@example.com"


def get_doc_id(d: dict) -> str:
    return str(d.get("id") or d.get("_id"))


def register_and_login(
    client: TestClient,
    name: str = "Test User",
    role: str = "EMPLOYEE",
    department: str = "Engineering",
    invite_code: str = None,
) -> tuple[str, str, dict]:
    """Registers and authenticates a test user via HTTP."""
    email = get_random_email()
    password = "Password123!"
    payload = {
        "name": name,
        "email": email,
        "password": password,
        "role": role,
        "department": department,
        "position": "Engineer",
    }
    if role == "TEAM_LEAD" and not invite_code:
        payload["invite_code"] = settings.TEAM_LEAD_INVITE_CODE
    elif invite_code:
        payload["invite_code"] = invite_code

    reg_res = client.post("/api/v1/auth/register", json=payload)
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"

    token = login_res.json()["access_token"]
    user = login_res.json()["user"]
    user["id"] = get_doc_id(user)
    return email, token, user


def test_task_assignment_creates_in_app_notification(client: TestClient):
    """Scenario 1: Team Lead assigns a task to Employee -> in-app notification generated."""
    _, lead_token, _ = register_and_login(client, name="Lead Alice", role="TEAM_LEAD", department="Engineering")
    _, emp_token, emp_data = register_and_login(client, name="Emp Bob", role="EMPLOYEE", department="Engineering")

    lead_headers = {"Authorization": f"Bearer {lead_token}"}
    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    emp_id = get_doc_id(emp_data)

    # Team Lead creates task assigned to Employee
    create_payload = {
        "title": "Build Authentication Gate",
        "description": "Implement multi-factor check",
        "status": "TODO",
        "priority": "HIGH",
        "assignee_id": emp_id,
        "due_date": "2026-10-30T12:00:00Z",
    }
    res = client.post("/api/v1/tasks", headers=lead_headers, json=create_payload)
    assert res.status_code == 201

    # Check unread count for Employee
    count_res = client.get("/api/v1/notifications/unread-count", headers=emp_headers)
    assert count_res.status_code == 200
    assert count_res.json()["unread_count"] >= 1

    # Employee fetches notifications
    notif_res = client.get("/api/v1/notifications", headers=emp_headers)
    assert notif_res.status_code == 200
    data = notif_res.json()
    assert data["total"] >= 1
    recent_notif = data["items"][0]
    assert recent_notif["title"] == "New task assigned"
    assert "Lead Alice assigned you the task 'Build Authentication Gate'" in recent_notif["message"]
    assert "HIGH" in recent_notif["message"]
    assert recent_notif["is_read"] is False
    assert recent_notif["type"] == "TASK_ASSIGNED"


def test_mark_single_notification_read(client: TestClient):
    """Scenario 2: Marking one notification as read updates status and decrements unread count."""
    _, lead_token, _ = register_and_login(client, name="Lead Sarah", role="TEAM_LEAD", department="Engineering")
    _, emp_token, emp_data = register_and_login(client, name="Emp David", role="EMPLOYEE", department="Engineering")

    lead_headers = {"Authorization": f"Bearer {lead_token}"}
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    client.post("/api/v1/tasks", headers=lead_headers, json={
        "title": "Update SSL Certificate",
        "status": "TODO",
        "priority": "MEDIUM",
        "assignee_id": get_doc_id(emp_data),
    })

    # Fetch notification ID
    notif_list = client.get("/api/v1/notifications", headers=emp_headers).json()["items"]
    assert len(notif_list) >= 1
    notif_id = get_doc_id(notif_list[0])

    # Initial unread count
    assert client.get("/api/v1/notifications/unread-count", headers=emp_headers).json()["unread_count"] >= 1

    # Mark as read
    patch_res = client.patch(f"/api/v1/notifications/{notif_id}/read", headers=emp_headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["is_read"] is True

    # Unread count decremented
    assert client.get("/api/v1/notifications/unread-count", headers=emp_headers).json()["unread_count"] == 0


def test_notification_recipient_isolation_idor(client: TestClient):
    """Scenario 3: An employee cannot view or mark read another user's notifications."""
    _, lead_token, _ = register_and_login(client, name="Lead Chris", role="TEAM_LEAD", department="DevOps")
    _, emp_a_token, emp_a = register_and_login(client, name="Emp A", role="EMPLOYEE", department="DevOps")
    _, emp_b_token, _ = register_and_login(client, name="Emp B", role="EMPLOYEE", department="DevOps")

    lead_headers = {"Authorization": f"Bearer {lead_token}"}
    emp_a_headers = {"Authorization": f"Bearer {emp_a_token}"}
    emp_b_headers = {"Authorization": f"Bearer {emp_b_token}"}

    # Assign task to Emp A
    client.post("/api/v1/tasks", headers=lead_headers, json={
        "title": "Confidential Security Audit",
        "status": "TODO",
        "priority": "HIGH",
        "assignee_id": get_doc_id(emp_a),
    })

    notif_a = client.get("/api/v1/notifications", headers=emp_a_headers).json()["items"][0]
    notif_id_a = get_doc_id(notif_a)

    # Emp B tries to mark Emp A's notification as read -> 403 Forbidden
    forbidden_res = client.patch(f"/api/v1/notifications/{notif_id_a}/read", headers=emp_b_headers)
    assert forbidden_res.status_code in [403, 404]

    # Emp B's notification list does not leak Emp A's notification
    list_b = client.get("/api/v1/notifications", headers=emp_b_headers).json()
    assert list_b["total"] == 0


def test_mark_all_notifications_as_read(client: TestClient):
    """Scenario 4: Marking all notifications as read updates all unread items for current user."""
    _, lead_token, _ = register_and_login(client, name="Lead Emma", role="TEAM_LEAD", department="Design")
    _, emp_token, emp_data = register_and_login(client, name="Emp Dan", role="EMPLOYEE", department="Design")

    lead_headers = {"Authorization": f"Bearer {lead_token}"}
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # Create 3 tasks
    for i in range(3):
        client.post("/api/v1/tasks", headers=lead_headers, json={
            "title": f"Design Mockup {i}",
            "status": "TODO",
            "priority": "LOW",
            "assignee_id": get_doc_id(emp_data),
        })

    assert client.get("/api/v1/notifications/unread-count", headers=emp_headers).json()["unread_count"] == 3

    # Mark all read
    res = client.post("/api/v1/notifications/mark-all-read", headers=emp_headers)
    assert res.status_code == 200
    assert res.json()["updated_count"] == 3

    # Unread count now 0
    assert client.get("/api/v1/notifications/unread-count", headers=emp_headers).json()["unread_count"] == 0


def test_reassignment_and_priority_change_notifications(client: TestClient):
    """Scenario 5: Reassignment notifies new & old assignees; priority change notifies current assignee."""
    _, lead_token, _ = register_and_login(client, name="Lead Mike", role="TEAM_LEAD", department="Security")
    _, emp1_token, emp1 = register_and_login(client, name="Emp 1", role="EMPLOYEE", department="Security")
    _, emp2_token, emp2 = register_and_login(client, name="Emp 2", role="EMPLOYEE", department="Security")

    lead_headers = {"Authorization": f"Bearer {lead_token}"}
    emp1_headers = {"Authorization": f"Bearer {emp1_token}"}
    emp2_headers = {"Authorization": f"Bearer {emp2_token}"}

    # 1. Create task assigned to Emp 1
    create_res = client.post("/api/v1/tasks", headers=lead_headers, json={
        "title": "Audit Server Logs",
        "description": "Inspect auth logs",
        "status": "TODO",
        "priority": "LOW",
        "assignee_id": get_doc_id(emp1),
    })
    assert create_res.status_code == 201
    task_id = get_doc_id(create_res.json())

    # 2. Reassign task from Emp 1 to Emp 2
    patch_res = client.patch(f"/api/v1/tasks/{task_id}", headers=lead_headers, json={
        "assignee_id": get_doc_id(emp2),
    })
    assert patch_res.status_code == 200

    # Emp 2 receives reassignment notification
    emp2_notifs = client.get("/api/v1/notifications", headers=emp2_headers).json()["items"]
    assert len(emp2_notifs) == 1
    assert "reassigned" in emp2_notifs[0]["title"].lower() or "assigned" in emp2_notifs[0]["title"].lower()

    # Emp 1 receives reassignment notification
    emp1_notifs = client.get("/api/v1/notifications", headers=emp1_headers).json()["items"]
    assert len(emp1_notifs) == 2
    assert "reassigned" in emp1_notifs[0]["title"].lower()

    # 3. Priority changed from LOW to HIGH
    client.patch(f"/api/v1/tasks/{task_id}", headers=lead_headers, json={
        "priority": "HIGH",
    })

    # Emp 2 (current assignee) receives priority changed notification
    emp2_notifs_after = client.get("/api/v1/notifications", headers=emp2_headers).json()["items"]
    assert len(emp2_notifs_after) == 2
    assert emp2_notifs_after[0]["type"] == "TASK_PRIORITY_CHANGED"
    assert "LOW to HIGH" in emp2_notifs_after[0]["message"]

    # 4. Editing description only should NOT generate another notification
    client.patch(f"/api/v1/tasks/{task_id}", headers=lead_headers, json={
        "description": "Updated description without priority or assignee changes",
    })
    emp2_notifs_final = client.get("/api/v1/notifications", headers=emp2_headers).json()["items"]
    assert len(emp2_notifs_final) == 2  # Still 2!

