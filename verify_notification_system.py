import httpx
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def run_tests():
    print("=== Starting E2E Notification System Verification ===")
    client = httpx.Client(timeout=15.0)

    # 1. Register Team Lead
    lead_email = "lead.notif.test@taskflow.dev"
    lead_pass = "LeadPass123!"
    reg_lead_payload = {
        "email": lead_email,
        "password": lead_pass,
        "name": "Sarah Lead",
        "role": "TEAM_LEAD",
        "department": "Engineering",
        "invite_code": "SWAN-LEAD-2026"
    }
    r = client.post(f"{BASE_URL}/api/v1/auth/register", json=reg_lead_payload)
    if r.status_code == 409:
        pass
    elif r.status_code != 201:
        print(f"Failed to register lead: {r.status_code} {r.text}")
        sys.exit(1)

    r = client.post(f"{BASE_URL}/api/v1/auth/login", json={"email": lead_email, "password": lead_pass})
    assert r.status_code == 200, f"Lead login failed: {r.text}"
    lead_token = r.json()["access_token"]
    lead_headers = {"Authorization": f"Bearer {lead_token}"}

    # 2. Register Employee
    emp_email = "emp.notif.test@taskflow.dev"
    emp_pass = "EmpPass123!"
    reg_emp_payload = {
        "email": emp_email,
        "password": emp_pass,
        "name": "David Employee",
        "role": "EMPLOYEE",
        "department": "Engineering"
    }
    r = client.post(f"{BASE_URL}/api/v1/auth/register", json=reg_emp_payload)
    if r.status_code == 409:
        pass
    elif r.status_code != 201:
        print(f"Failed to register emp: {r.status_code} {r.text}")
        sys.exit(1)

    r = client.post(f"{BASE_URL}/api/v1/auth/login", json={"email": emp_email, "password": emp_pass})
    assert r.status_code == 200, f"Emp login failed: {r.text}"
    emp_token = r.json()["access_token"]
    emp_user = r.json()["user"]
    emp_id = emp_user.get("id") or emp_user.get("_id")
    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    print(f"[OK] Authenticated Team Lead and Employee (ID: {emp_id})")

    # 3. Employee starts with 0 unread notifications (or read existing)
    r = client.post(f"{BASE_URL}/api/v1/notifications/mark-all-read", headers=emp_headers)
    r = client.get(f"{BASE_URL}/api/v1/notifications/unread-count", headers=emp_headers)
    assert r.status_code == 200
    assert r.json()["unread_count"] == 0
    print("[OK] Employee unread count verified at 0")

    # 4. Team Lead assigns an URGENT task to Employee
    create_task_payload = {
        "title": "Migrate Payment Webhooks",
        "description": "Refactor Stripe and PayPal webhook listeners",
        "priority": "URGENT",
        "status": "TODO",
        "assignee_id": emp_id,
        "due_date": "2026-11-15T18:00:00Z"
    }
    r = client.post(f"{BASE_URL}/api/v1/tasks", json=create_task_payload, headers=lead_headers)
    assert r.status_code == 201, f"Create task failed: {r.text}"
    created_task = r.json()
    task_id = created_task.get("id") or created_task.get("_id")
    print(f"[OK] Team Lead created and assigned task {task_id} with URGENT priority")

    # 5. Check Employee in-app notification
    r = client.get(f"{BASE_URL}/api/v1/notifications/unread-count", headers=emp_headers)
    assert r.status_code == 200
    assert r.json()["unread_count"] == 1, f"Expected unread count 1, got {r.json()}"

    r = client.get(f"{BASE_URL}/api/v1/notifications", headers=emp_headers)
    assert r.status_code == 200
    notif_data = r.json()
    assert notif_data["total"] >= 1
    assignment_notif = notif_data["items"][0]
    notif_id = assignment_notif.get("id") or assignment_notif.get("_id")
    assert assignment_notif["type"] == "TASK_ASSIGNED"
    assert "Migrate Payment Webhooks" in assignment_notif["message"]
    assert "Urgent" in assignment_notif["message"] or "URGENT" in assignment_notif["message"]
    assert assignment_notif["task_id"] == task_id
    assert assignment_notif["is_read"] is False
    print(f"[OK] Employee received in-app notification {notif_id} with correct details")

    # 6. Team Lead updates priority to HIGH
    update_payload = {"priority": "HIGH"}
    r = client.patch(f"{BASE_URL}/api/v1/tasks/{task_id}", json=update_payload, headers=lead_headers)
    assert r.status_code == 200

    r = client.get(f"{BASE_URL}/api/v1/notifications/unread-count", headers=emp_headers)
    assert r.status_code == 200
    assert r.json()["unread_count"] == 2
    r = client.get(f"{BASE_URL}/api/v1/notifications", headers=emp_headers)
    priority_notif = r.json()["items"][0]
    assert priority_notif["type"] == "TASK_PRIORITY_CHANGED"
    print("[OK] Priority update triggered TASK_PRIORITY_CHANGED notification and incremented unread count to 2")

    # 7. Unrelated edit (changing description only) does not generate duplicate notification
    r = client.patch(f"{BASE_URL}/api/v1/tasks/{task_id}", json={"description": "Updated description text only"}, headers=lead_headers)
    assert r.status_code == 200
    r = client.get(f"{BASE_URL}/api/v1/notifications/unread-count", headers=emp_headers)
    assert r.json()["unread_count"] == 2, "Unrelated edit should not generate notifications"
    print("[OK] Unrelated task edit did not generate duplicate notifications")

    # 8. Employee marks single notification as read
    r = client.patch(f"{BASE_URL}/api/v1/notifications/{notif_id}/read", headers=emp_headers)
    assert r.status_code == 200
    assert r.json()["is_read"] is True

    r = client.get(f"{BASE_URL}/api/v1/notifications/unread-count", headers=emp_headers)
    assert r.json()["unread_count"] == 1
    print("[OK] Marked single notification as read; unread count correctly decremented")

    # 9. IDOR Security: Lead tries to read/mark Employee's notification -> 403 Forbidden
    r = client.patch(f"{BASE_URL}/api/v1/notifications/{notif_id}/read", headers=lead_headers)
    assert r.status_code == 403, f"Expected 403 for IDOR attempt, got {r.status_code}"
    print("[OK] IDOR protection verified: Users cannot modify or access other users' notifications")

    # 10. Mark all as read
    r = client.post(f"{BASE_URL}/api/v1/notifications/mark-all-read", headers=emp_headers)
    assert r.status_code == 200
    r = client.get(f"{BASE_URL}/api/v1/notifications/unread-count", headers=emp_headers)
    assert r.json()["unread_count"] == 0
    print("[OK] Mark all read cleared all unread notifications")

    print("\nALL NOTIFICATION AND ASSIGNMENT E2E CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
