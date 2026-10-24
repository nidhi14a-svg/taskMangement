import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response, status
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.models.user import USERS_COLLECTION, ACTIVATION_TOKENS_COLLECTION
from app.models.enums import UserRole, AccountStatus
from app.schemas.user import UserResponse
from app.schemas.employee import (
    EmployeeImportPreviewResponse,
    EmployeeImportConfirmRequest,
    EmployeeImportConfirmResponse,
    EmployeeListResponse,
)
from app.api.dependencies import require_admin
from app.services.csv_service import CsvService
from app.services.email_service import EmailService

router = APIRouter()


@router.get(
    "/template",
    summary="Download Sample Employee CSV Template",
    description="Returns a downloadable CSV file containing valid headers and example rows.",
)
async def download_csv_template(
    current_admin: UserResponse = Depends(require_admin),
) -> Response:
    """Returns downloadable sample CSV template for employee onboarding."""
    csv_content = CsvService.generate_sample_csv()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="sample_employees.csv"'},
    )


@router.post(
    "/import/error-report",
    summary="Generate CSV Error Report",
    description="Transforms validation failure rows into a downloadable CSV error report.",
)
async def download_error_report(
    rows: List[Dict[str, Any]],
    current_admin: UserResponse = Depends(require_admin),
) -> Response:
    """Returns downloadable CSV report of invalid rows and failure reasons."""
    csv_content = CsvService.generate_error_report_csv(rows)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="employee_import_errors.csv"'},
    )


@router.post(
    "/import/preview",
    response_model=EmployeeImportPreviewResponse,
    summary="Preview and Validate Employee CSV",
    description="Parses, normalizes, and validates an uploaded employee CSV without creating or modifying database records.",
)
async def preview_csv_import(
    file: UploadFile = File(..., description="Uploaded CSV file"),
    mapping: Optional[str] = Form(None, description="Optional JSON string of manual column mappings"),
    db: AsyncDatabase = Depends(get_database),
    current_admin: UserResponse = Depends(require_admin),
) -> EmployeeImportPreviewResponse:
    """
    Validation Preview stage:
    - Reads and normalizes headers, detecting synonyms.
    - Decodes UTF-8 and UTF-8 BOM.
    - Trims whitespace and normalizes emails.
    - Detects in-file duplicate emails and existing MongoDB registered emails.
    - Strictly read-only; creates no accounts.
    """
    # 1. Validate file extension
    filename = file.filename or ""
    if not filename.lower().endswith(".csv") and file.content_type not in (
        "text/csv",
        "text/plain",
        "application/vnd.ms-excel",
        "application/csv",
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{filename}'. Please upload a valid .csv file.",
        )

    file_bytes = await file.read()

    # 2. Parse raw CSV
    headers, parsed_rows, parse_errors = CsvService.parse_csv_bytes(file_bytes)
    if parse_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=" | ".join(parse_errors),
        )

    # 3. Resolve column mappings
    manual_map_dict: Optional[Dict[str, str]] = None
    if mapping:
        try:
            manual_map_dict = json.loads(mapping)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid manual column mapping JSON payload.",
            )

    column_mapping, mapping_required = CsvService.detect_and_map_headers(
        raw_headers=headers, manual_mapping=manual_map_dict
    )

    if mapping_required:
        return EmployeeImportPreviewResponse(
            total_rows=len(parsed_rows),
            valid_rows_count=0,
            invalid_rows_count=len(parsed_rows),
            duplicate_rows_count=0,
            existing_rows_count=0,
            headers_detected=headers,
            column_mapping=column_mapping,
            mapping_required=True,
            rows=[],
        )

    # 4. Extract all candidate emails and query MongoDB for existing accounts
    name_col = column_mapping.get("name")
    email_col = column_mapping.get("email")

    candidate_emails: List[str] = []
    for item in parsed_rows:
        data = item["data"]
        raw_email = data.get(email_col, "") if email_col else ""
        clean_email = raw_email.strip().lower()
        if clean_email:
            candidate_emails.append(clean_email)

    existing_db_emails: set[str] = set()
    if candidate_emails:
        cursor = db[USERS_COLLECTION].find(
            {"email": {"$in": candidate_emails}},
            {"email": 1},
        )
        existing_docs = await cursor.to_list(length=len(candidate_emails))
        existing_db_emails = {doc["email"] for doc in existing_docs if "email" in doc}

    # 5. Clean and validate every row
    preview_rows = CsvService.clean_and_validate_rows(
        parsed_rows=parsed_rows,
        column_mapping=column_mapping,
        existing_db_emails=existing_db_emails,
    )

    # 6. Aggregate counts
    valid_count = sum(1 for r in preview_rows if r.is_valid)
    invalid_count = sum(1 for r in preview_rows if not r.is_valid)
    dup_count = sum(1 for r in preview_rows if r.status == "DUPLICATE_IN_FILE")
    existing_count = sum(1 for r in preview_rows if r.status == "EXISTING_IN_DB")

    return EmployeeImportPreviewResponse(
        total_rows=len(preview_rows),
        valid_rows_count=valid_count,
        invalid_rows_count=invalid_count,
        duplicate_rows_count=dup_count,
        existing_rows_count=existing_count,
        headers_detected=headers,
        column_mapping=column_mapping,
        mapping_required=False,
        rows=preview_rows,
    )


@router.post(
    "/import/confirm",
    response_model=EmployeeImportConfirmResponse,
    summary="Confirm Employee Import",
    description="Saves approved employee rows to MongoDB, sets status to INVITED, and generates secure activation tokens.",
)
async def confirm_csv_import(
    payload: EmployeeImportConfirmRequest,
    db: AsyncDatabase = Depends(get_database),
    current_admin: UserResponse = Depends(require_admin),
) -> EmployeeImportConfirmResponse:
    """
    Executes the safe employee import:
    - Imports only approved, valid employee records.
    - Enforces MongoDB unique email constraint.
    - Prevents password storage from CSV.
    - Provisions activation tokens for invited employees.
    - Sends invitation emails if SMTP is configured.
    """
    rows_to_import = payload.rows
    if not rows_to_import:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No approved employee records provided for import.",
        )

    imported_employees: List[UserResponse] = []
    skipped_count = 0
    failed_count = 0
    errors: List[Dict[str, Any]] = []

    now = datetime.now(timezone.utc)
    token_expiry = now + timedelta(days=7)
    smtp_active = EmailService.is_configured()
    sent_any_emails = False

    for row in rows_to_import:
        clean_email = row.email.strip().lower()
        clean_name = row.name.strip()

        # Check existing in DB to guard against concurrent duplicates
        existing = await db[USERS_COLLECTION].find_one({"email": clean_email})
        if existing:
            skipped_count += 1
            errors.append({
                "row_number": row.row_number,
                "email": clean_email,
                "reason": "Account already exists in MongoDB.",
            })
            continue

        # Generate secure random activation token
        activation_token = secrets.token_urlsafe(32)
        new_id = ObjectId()

        user_doc = {
            "_id": new_id,
            "name": clean_name,
            "email": clean_email,
            "password_hash": "",  # Unmatchable placeholder until employee sets password
            "role": row.role.value,
            "position": row.position.strip() if row.position else None,
            "department": row.department.strip() if row.department else None,
            "status": AccountStatus.INVITED.value,
            "activation_token": activation_token,
            "activation_token_expires_at": token_expiry,
            "created_at": now,
            "updated_at": now,
        }

        token_doc = {
            "_id": ObjectId(),
            "token": activation_token,
            "user_id": str(new_id),
            "email": clean_email,
            "role": row.role.value,
            "expires_at": token_expiry,
            "is_used": False,
            "created_at": now,
        }

        try:
            await db[USERS_COLLECTION].insert_one(user_doc)
            await db[ACTIVATION_TOKENS_COLLECTION].insert_one(token_doc)

            imported_employees.append(UserResponse.model_validate(user_doc))

            # Attempt invitation email delivery if enabled and configured
            if payload.send_invitations and smtp_active:
                sent, _ = EmailService.send_invitation_email(
                    recipient_email=clean_email,
                    recipient_name=clean_name,
                    activation_token=activation_token,
                )
                if sent:
                    sent_any_emails = True
        except DuplicateKeyError:
            skipped_count += 1
            errors.append({
                "row_number": row.row_number,
                "email": clean_email,
                "reason": "Duplicate key conflict in MongoDB.",
            })
        except Exception as e:
            failed_count += 1
            errors.append({
                "row_number": row.row_number,
                "email": clean_email,
                "reason": f"Database insertion failed: {str(e)}",
            })

    if smtp_active and sent_any_emails:
        email_msg = "Account activation invitation emails dispatched via configured SMTP service."
    elif smtp_active and not sent_any_emails:
        email_msg = "No invitation emails dispatched."
    else:
        email_msg = "Email delivery is not configured. Activation tokens generated successfully for manual activation."

    return EmployeeImportConfirmResponse(
        total_processed=len(rows_to_import),
        imported_count=len(imported_employees),
        skipped_count=skipped_count,
        failed_count=failed_count,
        email_delivery=smtp_active and sent_any_emails,
        email_delivery_message=email_msg,
        imported_employees=imported_employees,
        errors=errors,
    )


@router.get(
    "",
    response_model=EmployeeListResponse,
    summary="List Employees Directory (ADMIN Only)",
    description="Returns filtered, searchable, and paginated list of all organization employees with account status.",
)
@router.get("/", response_model=EmployeeListResponse, include_in_schema=False)
async def list_employees(
    search: Optional[str] = Query(None, description="Search by name or email"),
    role: Optional[UserRole] = Query(None, description="Filter by role"),
    department: Optional[str] = Query(None, description="Filter by department"),
    status_filter: Optional[AccountStatus] = Query(None, alias="status", description="Filter by account status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncDatabase = Depends(get_database),
    current_admin: UserResponse = Depends(require_admin),
) -> EmployeeListResponse:
    """Returns organization employees directory for admin management."""
    query: Dict[str, Any] = {}

    if search and search.strip():
        term = search.strip()
        query["$or"] = [
            {"name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
        ]

    if role:
        query["role"] = role.value

    if department and department.strip():
        query["department"] = department.strip()

    if status_filter:
        query["status"] = status_filter.value

    total = await db[USERS_COLLECTION].count_documents(query)
    total_active = await db[USERS_COLLECTION].count_documents({"status": AccountStatus.ACTIVE.value})
    total_invited = await db[USERS_COLLECTION].count_documents({"status": AccountStatus.INVITED.value})

    skip = (page - 1) * page_size
    cursor = db[USERS_COLLECTION].find(query, {"password_hash": 0}).sort("created_at", -1).skip(skip).limit(page_size)
    user_docs = await cursor.to_list(length=page_size)

    total_pages = max(1, (total + page_size - 1) // page_size) if total > 0 else 1

    return EmployeeListResponse(
        items=[UserResponse.model_validate(doc) for doc in user_docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_active=total_active,
        total_invited=total_invited,
    )


@router.get(
    "/{employee_id}",
    response_model=UserResponse,
    summary="Get Employee by ID (ADMIN Only)",
    description="Retrieves full profile details for a specific employee.",
)
async def get_employee_by_id(
    employee_id: str,
    db: AsyncDatabase = Depends(get_database),
    current_admin: UserResponse = Depends(require_admin),
) -> UserResponse:
    """Retrieves employee profile by MongoDB ObjectId."""
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid employee ID format: '{employee_id}'.",
        )

    doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(employee_id)}, {"password_hash": 0})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee with ID '{employee_id}' not found.",
        )

    return UserResponse.model_validate(doc)
