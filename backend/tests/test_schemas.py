from datetime import datetime, timezone
import pytest
from bson import ObjectId
from pydantic import ValidationError

from app.schemas.user import UserCreate, UserResponse, UserInDB
from app.schemas.task import TaskCreate, TaskResponse, TaskInDB
from app.models.enums import UserRole, TaskStatus, TaskPriority


def test_user_email_normalization_and_name_validation():
    """Test that email is lowercased and trimmed, and name is trimmed and non-empty."""
    user = UserCreate(
        name="  Jane Developer  ",
        email="  JANE.DEV@EXAMPLE.COM  ",
        password="secretpassword123",
        role=UserRole.USER,
    )
    assert user.email == "jane.dev@example.com"
    assert user.name == "Jane Developer"

    # Blank name must raise validation error
    with pytest.raises(ValidationError):
        UserCreate(name="   ", email="test@example.com", password="password123")


def test_user_response_excludes_password_hash():
    """Test that public UserResponse schema never exposes password_hash and stringifies ObjectId."""
    oid = ObjectId()
    now = datetime.now(timezone.utc)
    user_db = UserInDB(
        _id=oid,
        name="Security Expert",
        email="security@example.com",
        password_hash="argon2_or_bcrypt_hash",
        role=UserRole.ADMIN,
        created_at=now,
        updated_at=now,
    )

    # Convert to public UserResponse
    response = UserResponse.model_validate(user_db.model_dump(by_alias=True))
    dumped = response.model_dump(by_alias=True)

    assert "password_hash" not in dumped
    assert dumped["_id"] == str(oid)
    assert isinstance(dumped["_id"], str)
    assert dumped["name"] == "Security Expert"
    assert dumped["role"] == UserRole.ADMIN


def test_task_title_validation():
    """Test that task title is trimmed, non-empty, and limited in length."""
    task = TaskCreate(title="  Refactor Database Layer  ")
    assert task.title == "Refactor Database Layer"

    # Empty/whitespace title must fail
    with pytest.raises(ValidationError):
        TaskCreate(title="   ")

    # Title exceeding 255 chars must fail
    with pytest.raises(ValidationError):
        TaskCreate(title="x" * 256)


def test_task_due_date_timezone_policy():
    """Test that due_date normalizes naive datetimes to timezone-aware UTC."""
    naive_dt = datetime(2026, 11, 30, 15, 0, 0)
    task = TaskCreate(title="Sprint Deliverable", due_date=naive_dt)

    assert task.due_date is not None
    assert task.due_date.tzinfo == timezone.utc

    # ISO 8601 string input
    task_iso = TaskCreate(
        title="ISO Deadline Task",
        due_date="2026-12-01T12:00:00Z",  # type: ignore[arg-type]
    )
    assert task_iso.due_date is not None
    assert task_iso.due_date.tzinfo == timezone.utc


def test_task_response_serializes_object_ids_as_strings():
    """Test that TaskResponse validates and serializes _id, creator_id, and assignee_id as strings in JSON."""
    task_id = ObjectId()
    creator_id = ObjectId()
    assignee_id = ObjectId()
    now = datetime.now(timezone.utc)

    task_db = TaskInDB(
        _id=task_id,
        title="Implement PyMongo Async",
        description="Connect with FastAPI lifespan",
        status=TaskStatus.IN_PROGRESS,
        priority=TaskPriority.HIGH,
        due_date=now,
        creator_id=creator_id,
        assignee_id=assignee_id,
        created_at=now,
        updated_at=now,
    )

    response = TaskResponse.model_validate(task_db.model_dump(by_alias=True))
    data = response.model_dump(by_alias=True)

    assert data["_id"] == str(task_id)
    assert data["creator_id"] == str(creator_id)
    assert data["assignee_id"] == str(assignee_id)
    assert isinstance(data["_id"], str)
    assert isinstance(data["creator_id"], str)
    assert isinstance(data["assignee_id"], str)
