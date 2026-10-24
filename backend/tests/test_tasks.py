import uuid
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi.testclient import TestClient

from app.models.enums import TaskStatus, TaskPriority, UserRole
from scripts.create_admin import provision_admin
import asyncio


def get_random_email() -> str:
    return f"taskuser_{uuid.uuid4().hex[:10]}@example.com"


def create_test_user(client: TestClient, name: str = "Test User") -> tuple[str, str, dict]:
    """Helper to register and login a regular user, returning (email, token, user_dict)."""
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
    """Helper to provision and login an administrator user."""
    admin_email = get_random_email()
    admin_password = "AdminPassword123!"
    asyncio.run(
        provision_admin(
            name="Test Admin",
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
# 1. USER DIRECTORY TESTS (GET /api/v1/users)
# ==============================================================================


def test_get_user_directory_authenticated(client: TestClient):
    """Test authenticated user can list users directory without sensitive password hashes."""
    _, token, _ = create_test_user(client, "Directory User")

    resp = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    users = resp.json()
    assert isinstance(users, list)
    assert len(users) >= 1

    for u in users:
        assert "password_hash" not in u
        assert "email" in u
        assert "name" in u
        assert "role" in u


def test_get_user_directory_unauthenticated(client: TestClient):
    """Test unauthenticated user is rejected with HTTP 401."""
    resp = client.get("/api/v1/users")
    assert resp.status_code == 401


# ==============================================================================
# 2. TASK CREATION TESTS (POST /api/v1/tasks)
# ==============================================================================


def test_create_task_success(client: TestClient):
    """Test successful task creation with automatic creator_id assignment."""
    _, creator_token, creator_user = create_test_user(client, "Creator")
    _, _, assignee_user = create_test_user(client, "Assignee")

    assignee_id = assignee_user.get("_id") or assignee_user.get("id")
    due_date = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()

    payload = {
        "title": "Build Architecture Foundation",
        "description": "Establish FastAPI and MongoDB connections cleanly",
        "status": "TODO",
        "priority": "HIGH",
        "due_date": due_date,
        "assignee_id": assignee_id,
    }

    resp = client.post(
        "/api/v1/tasks",
        json=payload,
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert resp.status_code == 201

    data = resp.json()
    assert data["title"] == "Build Architecture Foundation"
    assert data["description"] == "Establish FastAPI and MongoDB connections cleanly"
    assert data["status"] == "TODO"
    assert data["priority"] == "HIGH"

    creator_id = creator_user.get("_id") or creator_user.get("id")
    assert data["creator_id"] == creator_id
    assert data["assignee_id"] == assignee_id
    assert "created_at" in data
    assert "updated_at" in data


def test_create_task_sets_creator_ignoring_client_input(client: TestClient):
    """Test that client cannot inject creator_id into TaskCreate."""
    _, token, _ = create_test_user(client)

    payload = {
        "title": "Tampered Creator Task",
        "creator_id": str(ObjectId()),  # Unauthorized field
    }

    resp = client.post(
        "/api/v1/tasks",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    # Extra inputs are forbidden by Pydantic schema
    assert resp.status_code == 422


def test_create_task_nonexistent_assignee_returns_404(client: TestClient):
    """Test creating a task with a non-existent assignee returns HTTP 404."""
    _, token, _ = create_test_user(client)

    payload = {
        "title": "Task with Ghost Assignee",
        "assignee_id": str(ObjectId()),  # Valid format but doesn't exist
    }

    resp = client.post(
        "/api/v1/tasks",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
    assert "does not exist" in resp.json()["detail"].lower()


def test_create_task_validation_errors(client: TestClient):
    """Test validation errors for empty title and invalid enums."""
    _, token, _ = create_test_user(client)

    # Empty title
    resp1 = client.post(
        "/api/v1/tasks",
        json={"title": "   "},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 422

    # Invalid status enum
    resp2 = client.post(
        "/api/v1/tasks",
        json={"title": "Valid Title", "status": "INVALID_STATUS"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 422


# ==============================================================================
# 3. TASK RETRIEVAL TESTS (GET /api/v1/tasks/{task_id})
# ==============================================================================


def test_get_task_by_id_authorized_for_creator_and_assignee(client: TestClient):
    """Test creator and assignee can access their task, but other users cannot."""
    _, creator_token, _ = create_test_user(client, "Task Creator")
    _, assignee_token, assignee_user = create_test_user(client, "Task Assignee")
    _, other_token, _ = create_test_user(client, "Unrelated User")

    assignee_id = assignee_user.get("_id") or assignee_user.get("id")

    # Create task
    create_resp = client.post(
        "/api/v1/tasks",
        json={"title": "Shared Task", "assignee_id": assignee_id},
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert create_resp.status_code == 201
    task_id = create_resp.json()["_id"]

    # 1. Creator can read
    r1 = client.get(f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {creator_token}"})
    assert r1.status_code == 200
    assert r1.json()["title"] == "Shared Task"

    # 2. Assignee can read
    r2 = client.get(f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {assignee_token}"})
    assert r2.status_code == 200

    # 3. Unrelated user gets 403 Forbidden
    r3 = client.get(f"/api/v1/tasks/{task_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert r3.status_code == 403


def test_get_task_by_id_admin_access(client: TestClient):
    """Test ADMIN role can read any task regardless of creator or assignee."""
    _, creator_token, _ = create_test_user(client, "Creator")
    _, admin_token, _ = create_test_admin(client)

    create_resp = client.post(
        "/api/v1/tasks",
        json={"title": "Private User Task"},
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert create_resp.status_code == 201
    task_id = create_resp.json()["_id"]

    admin_resp = client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_resp.status_code == 200
    assert admin_resp.json()["title"] == "Private User Task"


def test_get_task_invalid_and_nonexistent_id(client: TestClient):
    """Test 422 for invalid ObjectId format and 404 for non-existent task."""
    _, token, _ = create_test_user(client)

    # Invalid ID
    resp1 = client.get("/api/v1/tasks/not-a-valid-oid", headers={"Authorization": f"Bearer {token}"})
    assert resp1.status_code == 422

    # Non-existent ID
    resp2 = client.get(f"/api/v1/tasks/{ObjectId()}", headers={"Authorization": f"Bearer {token}"})
    assert resp2.status_code == 404


# ==============================================================================
# 4. TASK LISTING, SEARCH, FILTERING, SORTING, PAGINATION
# ==============================================================================


def test_list_tasks_scoping_and_visibility(client: TestClient):
    """Test regular users only see their own created or assigned tasks, while ADMIN sees all."""
    _, user_a_token, user_a = create_test_user(client, "User A")
    _, user_b_token, user_b = create_test_user(client, "User B")
    _, admin_token, _ = create_test_admin(client)

    # User A creates a task
    client.post(
        "/api/v1/tasks",
        json={"title": f"User A Secret Task {uuid.uuid4().hex[:6]}"},
        headers={"Authorization": f"Bearer {user_a_token}"},
    )

    # User B creates a task
    client.post(
        "/api/v1/tasks",
        json={"title": f"User B Private Task {uuid.uuid4().hex[:6]}"},
        headers={"Authorization": f"Bearer {user_b_token}"},
    )

    # User A listing
    list_a = client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {user_a_token}"}).json()
    for t in list_a["items"]:
        assert "User B Private Task" not in t["title"]

    # User B listing
    list_b = client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {user_b_token}"}).json()
    for t in list_b["items"]:
        assert "User A Secret Task" not in t["title"]

    # Admin listing can see tasks from all users
    list_admin = client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert list_admin["total"] >= 2


def test_list_tasks_created_and_assigned_filters(client: TestClient):
    """Test filtering by created (creator_id) vs assigned (assignee_id)."""
    _, user_a_token, user_a = create_test_user(client, "Creator User")
    _, user_b_token, user_b = create_test_user(client, "Assignee User")
    user_b_id = user_b.get("_id") or user_b.get("id")

    # User A creates a task assigned to User B
    tag_ab = uuid.uuid4().hex[:6]
    client.post(
        "/api/v1/tasks",
        json={"title": f"Task from A to B {tag_ab}", "assignee_id": user_b_id},
        headers={"Authorization": f"Bearer {user_a_token}"},
    )

    # User B creates a task for themselves
    tag_b = uuid.uuid4().hex[:6]
    client.post(
        "/api/v1/tasks",
        json={"title": f"Task created by B {tag_b}"},
        headers={"Authorization": f"Bearer {user_b_token}"},
    )

    # User B checks "assigned to me" -> should only see task from A to B
    resp_b_assigned = client.get("/api/v1/tasks?filter=assigned", headers={"Authorization": f"Bearer {user_b_token}"}).json()
    assigned_titles = [t["title"] for t in resp_b_assigned["items"]]
    assert any(f"Task from A to B {tag_ab}" in t for t in assigned_titles)
    assert not any(f"Task created by B {tag_b}" in t for t in assigned_titles)

    # User B checks "created by me" (My Tasks) -> should only see task created by B
    resp_b_created = client.get("/api/v1/tasks?filter=created", headers={"Authorization": f"Bearer {user_b_token}"}).json()
    created_titles = [t["title"] for t in resp_b_created["items"]]
    assert any(f"Task created by B {tag_b}" in t for t in created_titles)
    assert not any(f"Task from A to B {tag_ab}" in t for t in created_titles)


def test_list_tasks_search_and_filters(client: TestClient):
    """Test case-insensitive search, status, and priority filtering."""
    _, token, _ = create_test_user(client, "Filter Tester")
    unique_tag = uuid.uuid4().hex[:6]

    client.post(
        "/api/v1/tasks",
        json={
            "title": f"Optimize MongoDB Indexes {unique_tag}",
            "status": "IN_PROGRESS",
            "priority": "HIGH",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    client.post(
        "/api/v1/tasks",
        json={
            "title": f"Write React Components {unique_tag}",
            "status": "TODO",
            "priority": "LOW",
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    # Search for 'indexes' (case-insensitive)
    search_resp = client.get(
        f"/api/v1/tasks?search=indexes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert search_resp.status_code == 200
    search_data = search_resp.json()
    assert any("Optimize MongoDB Indexes" in t["title"] for t in search_data["items"])
    assert not any("Write React Components" in t["title"] for t in search_data["items"])

    # Filter by status = IN_PROGRESS
    status_resp = client.get(
        "/api/v1/tasks?status=IN_PROGRESS",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_resp.status_code == 200
    for t in status_resp.json()["items"]:
        assert t["status"] == "IN_PROGRESS"

    # Filter by priority = HIGH
    priority_resp = client.get(
        "/api/v1/tasks?priority=HIGH",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert priority_resp.status_code == 200
    for t in priority_resp.json()["items"]:
        assert t["priority"] == "HIGH"


def test_list_tasks_sorting_and_pagination(client: TestClient):
    """Test pagination metadata and due_date sorting."""
    _, token, _ = create_test_user(client, "Pagination Tester")

    base_date = datetime.now(timezone.utc)
    for i in range(5):
        client.post(
            "/api/v1/tasks",
            json={
                "title": f"Numbered Task {i}",
                "due_date": (base_date + timedelta(days=i + 1)).isoformat(),
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    # Test pagination page=1, page_size=2
    page1 = client.get(
        "/api/v1/tasks?page=1&page_size=2&sort_by=due_date&sort_order=asc",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert page1["page"] == 1
    assert page1["page_size"] == 2
    assert len(page1["items"]) == 2
    assert page1["total"] >= 5
    assert page1["total_pages"] >= 3

    # Test page 2
    page2 = client.get(
        "/api/v1/tasks?page=2&page_size=2&sort_by=due_date&sort_order=asc",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    assert page2["page"] == 2
    assert len(page2["items"]) == 2
    # Ensure distinct items
    assert page1["items"][0]["_id"] != page2["items"][0]["_id"]


# ==============================================================================
# 5. TASK UPDATE TESTS (PATCH /api/v1/tasks/{task_id})
# ==============================================================================


def test_creator_can_update_all_permitted_fields(client: TestClient):
    """Test creator can update title, description, priority, due_date, status, and assignment."""
    _, creator_token, _ = create_test_user(client, "Creator")
    _, _, assignee = create_test_user(client, "New Assignee")
    assignee_id = assignee.get("_id") or assignee.get("id")

    task = client.post(
        "/api/v1/tasks",
        json={"title": "Original Title", "priority": "LOW"},
        headers={"Authorization": f"Bearer {creator_token}"},
    ).json()
    task_id = task["_id"]

    new_due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    patch_payload = {
        "title": "Updated Title",
        "description": "Now with detailed description",
        "priority": "HIGH",
        "status": "IN_PROGRESS",
        "due_date": new_due,
        "assignee_id": assignee_id,
    }

    resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json=patch_payload,
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["description"] == "Now with detailed description"
    assert data["priority"] == "HIGH"
    assert data["status"] == "IN_PROGRESS"
    assert data["assignee_id"] == assignee_id


def test_assignee_can_only_update_status(client: TestClient):
    """Test assigned user can update status, but gets 403 Forbidden when modifying title or assignment."""
    _, creator_token, _ = create_test_user(client, "Owner")
    _, assignee_token, assignee = create_test_user(client, "Assignee Only")
    assignee_id = assignee.get("_id") or assignee.get("id")

    # Creator assigns task to assignee
    task = client.post(
        "/api/v1/tasks",
        json={"title": "Team Task", "status": "TODO", "assignee_id": assignee_id},
        headers={"Authorization": f"Bearer {creator_token}"},
    ).json()
    task_id = task["_id"]

    # 1. Assignee updating status succeeds
    status_resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "IN_PROGRESS"},
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "IN_PROGRESS"

    # 2. Assignee trying to rename task -> 403 Forbidden
    title_resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "Assignee Renamed Task"},
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert title_resp.status_code == 403
    assert "only permitted to update the task status" in title_resp.json()["detail"].lower()

    # 3. Assignee trying to reassign task -> 403 Forbidden
    reassign_resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"assignee_id": str(ObjectId())},
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert reassign_resp.status_code == 403


def test_patch_protected_ownership_fields_rejected(client: TestClient):
    """Test attempt to alter creator_id or identity fields is rejected with HTTP 422."""
    _, creator_token, _ = create_test_user(client)

    task = client.post(
        "/api/v1/tasks",
        json={"title": "Ownership Task"},
        headers={"Authorization": f"Bearer {creator_token}"},
    ).json()
    task_id = task["_id"]

    resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"creator_id": str(ObjectId())},
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert resp.status_code == 422


# ==============================================================================
# 6. TASK DELETION TESTS (DELETE /api/v1/tasks/{task_id})
# ==============================================================================


def test_creator_can_delete_task(client: TestClient):
    """Test creator can delete their task, returning HTTP 204 No Content."""
    _, creator_token, _ = create_test_user(client)

    task = client.post(
        "/api/v1/tasks",
        json={"title": "To Be Deleted"},
        headers={"Authorization": f"Bearer {creator_token}"},
    ).json()
    task_id = task["_id"]

    del_resp = client.delete(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert del_resp.status_code == 204

    # Subsequent retrieval returns 404
    get_resp = client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert get_resp.status_code == 404


def test_assignee_cannot_delete_task(client: TestClient):
    """Test assignee attempting to delete task receives HTTP 403 Forbidden."""
    _, creator_token, _ = create_test_user(client, "Task Creator")
    _, assignee_token, assignee = create_test_user(client, "Task Assignee")
    assignee_id = assignee.get("_id") or assignee.get("id")

    task = client.post(
        "/api/v1/tasks",
        json={"title": "Undeletable by Assignee", "assignee_id": assignee_id},
        headers={"Authorization": f"Bearer {creator_token}"},
    ).json()
    task_id = task["_id"]

    del_resp = client.delete(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {assignee_token}"},
    )
    assert del_resp.status_code == 403


def test_admin_can_delete_any_task(client: TestClient):
    """Test ADMIN role can delete any task in the system."""
    _, creator_token, _ = create_test_user(client, "User")
    _, admin_token, _ = create_test_admin(client)

    task = client.post(
        "/api/v1/tasks",
        json={"title": "Task for Admin Deletion"},
        headers={"Authorization": f"Bearer {creator_token}"},
    ).json()
    task_id = task["_id"]

    del_resp = client.delete(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_resp.status_code == 204
