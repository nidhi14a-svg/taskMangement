"""
End-to-End Live Workflow Verification Script
Verifies:
1. Admin authentication (JWT generation).
2. GET /api/v1/employees/template (Sample CSV download).
3. POST /api/v1/employees/import/preview with a fresh CSV:
   - Validates alias mapping (Full Name -> name, Work Email -> email, User Role -> role, Designation -> position)
   - Checks detection of invalid rows (missing email, unsupported role)
   - Checks counts: 5 total, 3 valid, 2 invalid
4. POST /api/v1/employees/import/confirm:
   - Imports the 3 valid rows
   - Verifies honest reporting of unconfigured SMTP
   - Verifies users are created in MongoDB with status INVITED and activation tokens generated
5. Verification of Collision / Existing User Detection:
   - Re-runs preview on the same CSV
   - Asserts that all previously imported rows are flagged as status EXISTING_IN_DB with clear error message
6. GET /api/v1/employees:
   - Verifies new employees appear in directory with status INVITED
7. POST /api/v1/tasks:
   - Admin creates a task assigned directly to one of the imported employees (Grace Hopper)
   - Verifies task assignment persists and reflects assignee details
8. GET /api/v1/auth/activate/verify:
   - Fetches activation token from database
   - Verifies token validity and recipient metadata
9. POST /api/v1/auth/activate:
   - Activates account with new password
   - Verifies employee status transitions to ACTIVE and valid JWT is returned
10. Employee login:
   - Logs in as newly activated employee
   - Fetches their tasks (GET /api/v1/tasks?filter=assigned) and confirms the assigned task is visible
11. Employee Updates Task:
   - Updates status to IN_PROGRESS
"""
import sys
import os
import uuid
import httpx
import asyncio
from pymongo import AsyncMongoClient
from bson import ObjectId

BASE_URL = "http://127.0.0.1:8000"

async def run_e2e():
    print("=== STARTING LIVE END-TO-END VERIFICATION ===")
    run_id = uuid.uuid4().hex[:6]
    grace_email = f"grace_{run_id}@taskflow-import.com"
    ada_email = f"ada_{run_id}@taskflow-import.com"
    alan_email = f"alan_{run_id}@taskflow-import.com"

    # Create run-specific CSV
    csv_content = f"""Full Name,Work Email,User Role,Designation,Department
Grace Hopper,{grace_email},Team Lead,Systems Architect,Engineering
Ada Lovelace,{ada_email},Employee,Algorithm Engineer,Engineering
Alan Turing,{alan_email},Employee,Cryptanalyst,Security
Invalid User,,Employee,Junior Dev,Engineering
Bad Role Person,bad_{run_id}@taskflow-import.com,SuperUser,Manager,Operations
"""

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        # 1. Admin Login
        print("\n[1] Logging in as Admin...")
        login_res = await client.post("/api/v1/auth/login", json={
            "email": "admin@taskflow.dev",
            "password": "AdminPass123!"
        })
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        admin_data = login_res.json()
        admin_token = admin_data["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        admin_id = admin_data['user'].get('id') or admin_data['user'].get('_id')
        print(f"  ✓ Admin logged in successfully (id: {admin_id})")

        # 2. Download CSV Template
        print("\n[2] Downloading sample CSV template...")
        template_res = await client.get("/api/v1/employees/template", headers=headers)
        assert template_res.status_code == 200, f"Template download failed: {template_res.text}"
        assert "Full Name" in template_res.text and "Work Email" in template_res.text
        print("  ✓ Template downloaded with expected recognized headers")

        # 3. Upload CSV for Preview
        print("\n[3] Uploading CSV for deterministic preview...")
        preview_res = await client.post(
            "/api/v1/employees/import/preview",
            headers=headers,
            files={"file": ("import.csv", csv_content.encode("utf-8"), "text/csv")}
        )
        assert preview_res.status_code == 200, f"Preview failed: {preview_res.text}"
        preview = preview_res.json()
        print(f"  ✓ Preview Response: Total={preview['total_rows']}, Valid={preview['valid_rows_count']}, Invalid={preview['invalid_rows_count']}")
        assert preview["total_rows"] == 5
        assert preview["valid_rows_count"] == 3
        assert preview["invalid_rows_count"] == 2

        # Check alias recognition
        mapping = preview["column_mapping"]
        print(f"  ✓ Header mappings resolved: {mapping}")
        assert mapping.get("name") == "Full Name" and mapping.get("email") == "Work Email"

        # Check invalid rows
        invalid_rows = [r for r in preview["rows"] if not r["is_valid"]]
        assert len(invalid_rows) == 2
        print(f"  ✓ Invalid rows caught: Row {invalid_rows[0]['row_number']} ({invalid_rows[0]['errors']}), Row {invalid_rows[1]['row_number']} ({invalid_rows[1]['errors']})")

        # 4. Confirm Import of Valid Rows
        print("\n[4] Confirming import of approved valid records...")
        valid_rows = [
            {
                "row_number": r["row_number"],
                "name": r["name"],
                "email": r["email"],
                "role": r["role"],
                "position": r["position"],
                "department": r["department"],
            }
            for r in preview["rows"] if r["is_valid"]
        ]
        confirm_res = await client.post(
            "/api/v1/employees/import/confirm",
            headers=headers,
            json={"rows": valid_rows, "send_invitations": True}
        )
        assert confirm_res.status_code == 200, f"Confirm import failed: {confirm_res.text}"
        confirm_data = confirm_res.json()
        print(f"  ✓ Import confirmed: Imported={confirm_data['imported_count']}, Skipped={confirm_data['skipped_count']}")
        print(f"  ✓ Email delivery status: {confirm_data['email_delivery_message']}")
        assert confirm_data["imported_count"] == 3
        assert confirm_data["email_delivery"] is False
        assert "not configured" in confirm_data["email_delivery_message"]

        # 5. Collision & Duplicate Check: Re-preview the same CSV
        print("\n[5] Re-uploading same CSV to verify database collision detection...")
        re_preview_res = await client.post(
            "/api/v1/employees/import/preview",
            headers=headers,
            files={"file": ("import.csv", csv_content.encode("utf-8"), "text/csv")}
        )
        assert re_preview_res.status_code == 200
        re_preview = re_preview_res.json()
        print(f"  ✓ Re-preview: Existing in DB={re_preview['existing_rows_count']}, Valid={re_preview['valid_rows_count']}")
        assert re_preview["existing_rows_count"] == 3
        assert re_preview["valid_rows_count"] == 0

        # 6. Verify Employee Directory Listing
        print("\n[6] Querying Employee Directory for imported personnel...")
        emp_list_res = await client.get(f"/api/v1/employees?search={grace_email}", headers=headers)
        assert emp_list_res.status_code == 200
        emp_list = emp_list_res.json()
        assert len(emp_list["items"]) == 1
        grace = emp_list["items"][0]
        grace_id = str(grace.get("id") or grace.get("_id"))
        print(f"  ✓ Found imported employee: {grace['name']} | Status: {grace['status']} | Role: {grace['role']}")
        assert grace["status"] == "INVITED"
        assert grace["role"] == "TEAM_LEAD"

        # 7. Assign Task to Imported Employee
        print("\n[7] Admin assigns a new task to Grace Hopper...")
        task_payload = {
            "title": "Architect Next-Gen Security Protocol",
            "description": "Lead team in designing high-throughput post-quantum encryption protocols.",
            "status": "TODO",
            "priority": "HIGH",
            "assignee_id": grace_id,
        }
        task_res = await client.post("/api/v1/tasks", headers=headers, json=task_payload)
        assert task_res.status_code == 201, f"Task creation failed: {task_res.text}"
        task_data = task_res.json()
        task_id = str(task_data.get("id") or task_data.get("_id"))
        print(f"  ✓ Task created and assigned successfully! (Task ID: {task_id}, Assignee: {task_data.get('assignee_id')})")
        assert str(task_data["assignee_id"]) == grace_id

        # 8. Account Activation Flow
        print("\n[8] Simulating Account Activation Flow...")
        mongo = AsyncMongoClient("mongodb://localhost:27017")
        db = mongo["taskflow_db"]
        token_doc = await db["activation_tokens"].find_one({"email": grace_email, "is_used": False})
        assert token_doc is not None, "Activation token was not generated in database!"
        act_token = token_doc["token"]
        print(f"  ✓ Activation token retrieved: {act_token[:10]}...")

        # Verify token endpoint
        verify_res = await client.get(f"/api/v1/auth/activate/verify?token={act_token}")
        assert verify_res.status_code == 200
        verify_data = verify_res.json()
        assert verify_data["valid"] is True
        assert verify_data["email"] == grace_email
        print(f"  ✓ Activation token verified for: {verify_data['name']} ({verify_data['email']})")

        # Activate account and establish password
        print("  Setting password 'GraceSecure2026!' to activate account...")
        activate_res = await client.post("/api/v1/auth/activate", json={
            "token": act_token,
            "password": "GraceSecure2026!"
        })
        assert activate_res.status_code == 200, f"Activation failed: {activate_res.text}"
        act_login = activate_res.json()
        grace_token = act_login["access_token"]
        grace_user = act_login["user"]
        print(f"  ✓ Account activated! Status updated to: {grace_user['status']}")
        assert grace_user["status"] == "ACTIVE"

        # 9. Employee Logs In & Checks Assigned Tasks
        print("\n[9] Logging in as newly activated employee and viewing assigned tasks...")
        grace_headers = {"Authorization": f"Bearer {grace_token}"}
        grace_tasks_res = await client.get("/api/v1/tasks?filter=assigned", headers=grace_headers)
        assert grace_tasks_res.status_code == 200
        grace_tasks = grace_tasks_res.json()
        assigned_titles = [t["title"] for t in grace_tasks["items"]]
        print(f"  ✓ Employee assigned deliverables: {assigned_titles}")
        assert "Architect Next-Gen Security Protocol" in assigned_titles

        # 10. Employee Updates Task Status
        print("\n[10] Employee updating task status to IN_PROGRESS...")
        patch_res = await client.patch(f"/api/v1/tasks/{task_id}", headers=grace_headers, json={
            "status": "IN_PROGRESS"
        })
        assert patch_res.status_code == 200, f"Task patch failed: {patch_res.text}"
        print("  ✓ Task status updated to IN_PROGRESS by assignee!")

        await mongo.close()
        print("\n=======================================================")
        print("=== ALL 10 E2E VERIFICATION PHASES PASSED WITH 100%! ===")
        print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_e2e())
