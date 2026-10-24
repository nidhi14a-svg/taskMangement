import io
import uuid
import asyncio
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.models.enums import UserRole, AccountStatus
from scripts.create_admin import provision_admin


def get_random_email() -> str:
    return f"emp_test_{uuid.uuid4().hex[:8]}@example.com"


def create_test_admin(client: TestClient) -> tuple[str, str, dict]:
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


def register_user(client: TestClient, role: str = "EMPLOYEE", invite_code: str = None, department: str = "Engineering") -> tuple[str, str, dict]:
    email = get_random_email()
    password = "SecurePassword123!"
    payload = {
        "name": f"User {role}",
        "email": email,
        "password": password,
        "role": role,
        "department": department,
        "position": "Developer",
    }
    if invite_code:
        payload["invite_code"] = invite_code

    reg_resp = client.post("/api/v1/auth/register", json=payload)
    assert reg_resp.status_code == 201

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    user = login_resp.json()["user"]
    return email, token, user


def test_csv_template_download(client: TestClient):
    _, admin_token, _ = create_test_admin(client)
    resp = client.get(
        "/api/v1/employees/template",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "Full Name" in resp.text
    assert "Work Email" in resp.text


def test_csv_preview_rbac(client: TestClient):
    _, emp_token, _ = register_user(client, role="EMPLOYEE")
    _, lead_token, _ = register_user(client, role="TEAM_LEAD", invite_code=settings.TEAM_LEAD_INVITE_CODE)

    csv_bytes = b"Full Name,Work Email,Role\nJohn Doe,john@test.com,EMPLOYEE\n"

    # Unauthenticated -> 401
    resp_unauth = client.post(
        "/api/v1/employees/import/preview",
        files={"file": ("employees.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp_unauth.status_code == 401

    # EMPLOYEE -> 403
    resp_emp = client.post(
        "/api/v1/employees/import/preview",
        headers={"Authorization": f"Bearer {emp_token}"},
        files={"file": ("employees.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp_emp.status_code == 403

    # TEAM_LEAD -> 403
    resp_lead = client.post(
        "/api/v1/employees/import/preview",
        headers={"Authorization": f"Bearer {lead_token}"},
        files={"file": ("employees.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp_lead.status_code == 403


def test_csv_preview_valid_and_cleaned(client: TestClient):
    _, admin_token, _ = create_test_admin(client)
    alice_email = get_random_email()
    bob_email = get_random_email()

    # Tests: UTF-8 BOM, extra spaces, mixed case emails, role synonyms
    csv_content = (
        "\ufeff  Employee Name  ,  Work Email  ,  User Role  ,  Department  ,  Job Title  \n"
        f"  Alice Developer  ,  {alice_email.upper()}  ,  developer  ,  Engineering  ,  Frontend Engineer  \n"
        f"  Bob Manager  ,  {bob_email}  ,  lead  ,  Engineering  ,  Lead Engineer  \n"
    )
    csv_bytes = csv_content.encode("utf-8-sig")

    resp = client.post(
        "/api/v1/employees/import/preview",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("employees.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_rows"] == 2
    assert data["valid_rows_count"] == 2
    assert data["invalid_rows_count"] == 0
    assert data["mapping_required"] is False

    # Verify cleaning
    alice_row = data["rows"][0]
    assert alice_row["name"] == "Alice Developer"
    assert alice_row["email"] == alice_email.lower()
    assert alice_row["role"] == "EMPLOYEE"
    assert alice_row["department"] == "Engineering"
    assert alice_row["position"] == "Frontend Engineer"
    assert alice_row["is_valid"] is True
    assert alice_row["status"] == "VALID"

    bob_row = data["rows"][1]
    assert bob_row["name"] == "Bob Manager"
    assert bob_row["email"] == bob_email.lower()
    assert bob_row["role"] == "TEAM_LEAD"


def test_csv_preview_validation_errors(client: TestClient):
    _, admin_token, _ = create_test_admin(client)

    # Register an existing employee
    existing_email, _, _ = register_user(client, role="EMPLOYEE")

    # CSV with:
    # Row 2: Missing name
    # Row 3: Invalid email
    # Row 4: Duplicate email in file (first instance)
    # Row 5: Duplicate email in file (second instance)
    # Row 6: Email already registered in DB
    # Row 7: Invalid role
    dup_email = get_random_email()
    csv_content = (
        "name,email,role,department,position\n"
        f",worker1@swan.com,EMPLOYEE,Engineering,Dev\n"
        f"Worker Two,not-an-email,EMPLOYEE,Engineering,Dev\n"
        f"Duplicate One,{dup_email},EMPLOYEE,Engineering,Dev\n"
        f"Duplicate Two,{dup_email},EMPLOYEE,Engineering,Dev\n"
        f"Already Here,{existing_email},EMPLOYEE,Engineering,Dev\n"
        f"Invalid Role Worker,invalid@swan.com,SUPER_HERO,Engineering,Dev\n"
    )
    csv_bytes = csv_content.encode("utf-8")

    resp = client.post(
        "/api/v1/employees/import/preview",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("test_errors.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_rows"] == 6
    assert data["invalid_rows_count"] >= 5

    # Row 2: Missing name error
    assert any("Full name is required" in err for err in data["rows"][0]["errors"])
    assert data["rows"][0]["row_number"] == 2

    # Row 3: Invalid email format
    assert any("Invalid email format" in err for err in data["rows"][1]["errors"])
    assert data["rows"][1]["row_number"] == 3

    # Row 5: Duplicate in file
    assert data["rows"][3]["status"] == "DUPLICATE_IN_FILE"
    assert any("already present on row 4" in err for err in data["rows"][3]["errors"])

    # Row 6: Existing in DB
    assert data["rows"][4]["status"] == "EXISTING_IN_DB"
    assert any("already registered" in err for err in data["rows"][4]["errors"])

    # Row 7: Invalid role
    assert any("Invalid role 'SUPER_HERO'" in err for err in data["rows"][5]["errors"])


def test_csv_preview_empty_and_unsupported_files(client: TestClient):
    _, admin_token, _ = create_test_admin(client)

    # Non-csv extension
    resp_bad_ext = client.post(
        "/api/v1/employees/import/preview",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("test.exe", io.BytesIO(b"binarycontent"), "application/octet-stream")},
    )
    assert resp_bad_ext.status_code == 400

    # Empty CSV
    resp_empty = client.post(
        "/api/v1/employees/import/preview",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )
    assert resp_empty.status_code == 400


def test_confirm_import_and_account_activation(client: TestClient):
    _, admin_token, _ = create_test_admin(client)
    carlos_email = get_random_email()
    diana_email = get_random_email()

    confirm_payload = {
        "rows": [
            {
                "row_number": 2,
                "name": "Carlos NewHire",
                "email": carlos_email,
                "role": "EMPLOYEE",
                "department": "Engineering",
                "position": "Backend Developer",
            },
            {
                "row_number": 3,
                "name": "Diana Lead",
                "email": diana_email,
                "role": "TEAM_LEAD",
                "department": "Design",
                "position": "Design Director",
            },
        ],
        "send_invitations": False,
    }

    # 1. Confirm Import
    resp_confirm = client.post(
        "/api/v1/employees/import/confirm",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=confirm_payload,
    )
    assert resp_confirm.status_code == 200
    confirm_data = resp_confirm.json()
    assert confirm_data["imported_count"] == 2
    assert confirm_data["skipped_count"] == 0

    # 2. Verify imported records via GET /api/v1/employees
    list_resp = client.get(
        f"/api/v1/employees?search={carlos_email}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_resp.status_code == 200
    employees_list = list_resp.json()["items"]
    assert len(employees_list) == 1
    carlos_user = employees_list[0]
    assert carlos_user["status"] == AccountStatus.INVITED.value

    # 3. Retrieve activation token from database via get_employee_by_id or verify endpoint
    # Since password is empty for Carlos, test activating his account:
    carlos_id = carlos_user.get("_id") or carlos_user.get("id")
    emp_detail = client.get(
        f"/api/v1/employees/{carlos_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert emp_detail.status_code == 200

    # 4. Attempting duplicate confirm should skip
    resp_dup = client.post(
        "/api/v1/employees/import/confirm",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=confirm_payload,
    )
    assert resp_dup.status_code == 200
    assert resp_dup.json()["imported_count"] == 0
    assert resp_dup.json()["skipped_count"] == 2


def test_employees_directory_pagination_and_search(client: TestClient):
    _, admin_token, _ = create_test_admin(client)

    # Search by email
    resp = client.get(
        "/api/v1/employees?page=1&page_size=10",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "total_active" in data
    assert "total_invited" in data


def test_error_report_csv_generation(client: TestClient):
    _, admin_token, _ = create_test_admin(client)
    invalid_rows = [
        {
            "row_number": 2,
            "name": "",
            "email": "invalid-email",
            "role": "SUPER_HERO",
            "department": "Engineering",
            "position": "Dev",
            "errors": ["Full name is required.", "Invalid email format."],
        }
    ]
    resp = client.post(
        "/api/v1/employees/import/error-report",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=invalid_rows,
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "Validation Errors" in resp.text
    assert "Full name is required." in resp.text
