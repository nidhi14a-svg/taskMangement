from typing import Optional, Any
from pydantic import BaseModel, Field, EmailStr
from app.models.enums import UserRole, AccountStatus
from app.schemas.user import UserResponse


class EmployeeFilterParams(BaseModel):
    """Query filters for employee directory."""
    search: Optional[str] = None
    role: Optional[UserRole] = None
    department: Optional[str] = None
    status: Optional[AccountStatus] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class EmployeeImportPreviewRow(BaseModel):
    """Parsed and validated employee row for the import preview."""
    row_number: int = Field(..., description="1-indexed row number from the uploaded CSV")
    name: str = Field(..., description="Cleaned full name")
    email: str = Field(..., description="Normalized lowercase email")
    role: str = Field(default="EMPLOYEE", description="Normalized role enum value")
    position: Optional[str] = Field(None, description="Job title or designation")
    department: Optional[str] = Field(None, description="Department or team division")
    is_valid: bool = Field(..., description="Whether this row satisfies all validation constraints")
    status: str = Field(..., description="Row status: VALID, ERROR, DUPLICATE_IN_FILE, or EXISTING_IN_DB")
    errors: list[str] = Field(default_factory=list, description="Validation failure messages")
    warnings: list[str] = Field(default_factory=list, description="Advisory review warnings (e.g. Admin assignment)")
    original_data: dict[str, str] = Field(default_factory=dict, description="Raw column values before normalization")


class EmployeeImportPreviewResponse(BaseModel):
    """Validation preview payload returned before committing changes to MongoDB."""
    total_rows: int
    valid_rows_count: int
    invalid_rows_count: int
    duplicate_rows_count: int
    existing_rows_count: int
    headers_detected: list[str]
    column_mapping: dict[str, str] = Field(default_factory=dict, description="Canonical field to detected header mapping")
    mapping_required: bool = False
    rows: list[EmployeeImportPreviewRow]


class EmployeeImportConfirmRow(BaseModel):
    """Validated employee record to be inserted into MongoDB."""
    row_number: int
    name: str
    email: EmailStr
    role: UserRole = UserRole.EMPLOYEE
    position: Optional[str] = None
    department: Optional[str] = None


class EmployeeImportConfirmRequest(BaseModel):
    """Request payload to commit approved employee rows to MongoDB."""
    rows: list[EmployeeImportConfirmRow] = Field(..., min_length=1, description="List of approved employee records")
    send_invitations: bool = Field(default=True, description="Whether to attempt sending activation emails")


class EmployeeImportConfirmResponse(BaseModel):
    """Final report after employee import execution."""
    total_processed: int
    imported_count: int
    skipped_count: int
    failed_count: int
    email_delivery: bool
    email_delivery_message: str
    imported_employees: list[UserResponse] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)


class EmployeeListResponse(BaseModel):
    """Paginated list of employees with aggregate status counts."""
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    total_active: int
    total_invited: int
