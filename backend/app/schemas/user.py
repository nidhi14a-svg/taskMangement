from datetime import datetime, timezone
from typing import Optional, Any
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from app.core.object_id import PyObjectId
from app.models.enums import UserRole, AccountStatus


class UserRegisterRequest(BaseModel):
    """
    Schema for user registration.
    Allows specifying role (EMPLOYEE or TEAM_LEAD with invite code), position, and department.
    Guarantees public registration can NEVER assign ADMIN privileges.
    """

    name: str = Field(..., min_length=1, max_length=255, description="Full display name")
    email: EmailStr = Field(..., description="Unique user email address")
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Plaintext password, minimum 8 characters",
    )
    role: Optional[UserRole] = Field(default=UserRole.EMPLOYEE, description="Desired role (EMPLOYEE or TEAM_LEAD)")
    position: Optional[str] = Field(None, max_length=100, description="Job position (e.g. Frontend Developer)")
    department: Optional[str] = Field(None, max_length=100, description="Department (e.g. Engineering)")
    invite_code: Optional[str] = Field(None, description="Required invitation code for TEAM_LEAD registration")

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Any) -> str:
        """Consistently normalizes email by trimming whitespace and lowercasing."""
        if isinstance(v, str):
            v = v.strip().lower()
        return v

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        """Trims whitespace and ensures name is not blank."""
        if isinstance(v, str):
            v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty or blank.")
        return v

    @field_validator("position", "department", mode="before")
    @classmethod
    def trim_optional_fields(cls, v: Any) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            return v if v else None
        return v


class UserLoginRequest(BaseModel):
    """Schema for user credentials authentication."""

    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., description="User password")

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Any) -> str:
        if isinstance(v, str):
            v = v.strip().lower()
        return v


class UserBase(BaseModel):
    """Base user schema containing shared user attributes."""

    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: UserRole = Field(default=UserRole.EMPLOYEE)
    position: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    status: AccountStatus = Field(default=AccountStatus.ACTIVE)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Any) -> str:
        if isinstance(v, str):
            v = v.strip().lower()
        return v

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> str:
        if isinstance(v, str):
            v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty or blank.")
        return v


class UserCreate(UserBase):
    """Schema for creating a user internally or via admin provisioning."""

    password: str = Field(..., min_length=8, max_length=128)


class UserUpdate(BaseModel):
    """Schema for updating user details."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    position: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    status: Optional[AccountStatus] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Any) -> Optional[str]:
        if isinstance(v, str):
            return v.strip().lower()
        return v

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v: Any) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty or blank.")
        return v


class UserInDB(BaseModel):
    """Internal user model matching the MongoDB document structure."""

    id: PyObjectId = Field(default_factory=ObjectId, alias="_id")
    name: str
    email: str
    password_hash: str
    role: UserRole = UserRole.EMPLOYEE
    position: Optional[str] = None
    department: Optional[str] = None
    status: AccountStatus = AccountStatus.ACTIVE
    activation_token: Optional[str] = None
    activation_token_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class UserResponse(BaseModel):
    """Public user response schema that never exposes password_hash."""

    id: PyObjectId = Field(alias="_id")
    name: str
    email: str
    role: UserRole
    position: Optional[str] = None
    department: Optional[str] = None
    status: AccountStatus = AccountStatus.ACTIVE
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class AccountActivateRequest(BaseModel):
    """Schema for an invited employee to set their password and activate their account."""

    token: str = Field(..., min_length=1, description="Unique account activation token")
    password: str = Field(..., min_length=8, max_length=128, description="New secure password")


class AccountActivateVerifyResponse(BaseModel):
    """Details returned when validating an activation token."""

    valid: bool
    email: Optional[str] = None
    name: Optional[str] = None
    message: Optional[str] = None


class InvitationCreateRequest(BaseModel):
    """Request to generate an approved invitation code for a Team Lead."""

    department: str = Field(..., min_length=1, max_length=100, description="Department for the team lead")
    role: UserRole = Field(default=UserRole.TEAM_LEAD, description="Role permitted by this invitation")


class InvitationResponse(BaseModel):
    """Details of a generated invitation."""

    id: PyObjectId = Field(alias="_id")
    code: str
    role: UserRole
    department: str
    created_by: str
    is_used: bool = False
    created_at: datetime

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class LoginResponse(BaseModel):
    """Authentication response returning signed JWT access token and public user profile."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class Token(BaseModel):
    """Standalone bearer token response schema."""

    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Decoded JWT claims payload."""

    sub: Optional[str] = None
    exp: Optional[int] = None
    role: Optional[str] = None
