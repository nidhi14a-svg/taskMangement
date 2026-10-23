from datetime import datetime, timezone
from typing import Optional, Any
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from app.core.object_id import PyObjectId
from app.models.enums import UserRole


class UserRegisterRequest(BaseModel):
    """
    Schema for public user registration.
    Excludes role field to guarantee public registration can NEVER assign ADMIN privileges.
    """

    name: str = Field(..., min_length=1, max_length=255, description="Full display name")
    email: EmailStr = Field(..., description="Unique user email address")
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Plaintext password, minimum 8 characters",
    )

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
    role: UserRole = Field(default=UserRole.USER)

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
    role: UserRole = UserRole.USER
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
    created_at: datetime
    updated_at: datetime

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
