from datetime import datetime, timezone
from typing import Optional, Any
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.core.object_id import PyObjectId
from app.models.enums import TaskStatus, TaskPriority


class TaskBase(BaseModel):
    """Base schema containing common task attributes."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Required, non-empty, trimmed title limited to 255 characters",
    )
    description: Optional[str] = Field(
        default=None,
        description="Optional detailed description of the task",
    )
    status: TaskStatus = Field(
        default=TaskStatus.TODO,
        description="Task lifecycle status (TODO, IN_PROGRESS, COMPLETED)",
    )
    priority: TaskPriority = Field(
        default=TaskPriority.MEDIUM,
        description="Task priority level (LOW, MEDIUM, HIGH)",
    )
    due_date: Optional[datetime] = Field(
        default=None,
        description="Optional timezone-aware UTC deadline",
    )
    assignee_id: Optional[PyObjectId] = Field(
        default=None,
        description="Optional ObjectId referencing the assigned user",
    )

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> str:
        """Trims whitespace and ensures title is non-empty."""
        if isinstance(v, str):
            v = v.strip()
        if not v:
            raise ValueError("Task title must be a non-empty, trimmed string.")
        return v

    @field_validator("due_date", mode="before")
    @classmethod
    def normalize_timezone(cls, v: Any) -> Optional[datetime]:
        """Enforces consistent timezone-aware UTC datetime policy."""
        if v is None:
            return None
        if isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v.astimezone(timezone.utc)
        return v


class TaskCreate(TaskBase):
    """Schema for creating a task."""

    model_config = ConfigDict(extra="forbid")


class TaskUpdate(BaseModel):
    """Schema for updating an existing task. Ownership fields (creator_id, id) are forbidden."""

    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    assignee_id: Optional[PyObjectId] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Optional[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Task title cannot be empty or blank.")
        return v

    @field_validator("due_date", mode="before")
    @classmethod
    def normalize_timezone(cls, v: Any) -> Optional[datetime]:
        if v is None:
            return None
        if isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return v.replace(tzinfo=timezone.utc)
            return v.astimezone(timezone.utc)
        return v


class TaskInDB(BaseModel):
    """Internal task model matching the MongoDB document structure."""

    id: PyObjectId = Field(default_factory=ObjectId, alias="_id")
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: Optional[datetime] = None
    creator_id: PyObjectId
    assignee_id: Optional[PyObjectId] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class TaskResponse(BaseModel):
    """Public task response schema returning stringified ObjectIds."""

    id: PyObjectId = Field(alias="_id")
    title: str
    description: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime] = None
    creator_id: PyObjectId
    assignee_id: Optional[PyObjectId] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class TaskFilterParams(BaseModel):
    """Query parameter schema for listing and filtering tasks."""

    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    creator_id: Optional[PyObjectId] = None
    assignee_id: Optional[PyObjectId] = None
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)


class TaskPaginationResponse(BaseModel):
    """Paginated response containing list of tasks and pagination metadata."""

    items: list[TaskResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )
