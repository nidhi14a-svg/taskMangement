import pytest
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError
from app.core.config import settings
from app.core.database import init_db_indexes, check_mongo_connection
from app.models.user import USERS_COLLECTION
from app.models.task import TASKS_COLLECTION
from app.models.enums import UserRole, TaskStatus, TaskPriority


@pytest.fixture
async def test_db():
    """Provides an isolated test database with indexes initialized."""
    test_db_name = f"{settings.MONGODB_DB_NAME}_test"
    client = AsyncMongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=2000)
    db = client[test_db_name]

    # Initialize collections and indexes
    await init_db_indexes(db)

    yield db

    # Cleanup test database
    await client.drop_database(test_db_name)
    await client.close()


@pytest.mark.asyncio
async def test_mongo_connection_check():
    """Test safe check_mongo_connection helper returns connected status without credentials."""
    is_connected, status_detail = await check_mongo_connection()
    assert is_connected is True
    assert status_detail == "connected"


@pytest.mark.asyncio
async def test_users_collection_indexes_and_unique_email(test_db):
    """Test that users collection enforces unique index on email."""
    # Verify index exists
    index_names = []
    cursor = await test_db[USERS_COLLECTION].list_indexes()
    async for idx in cursor:
        index_names.append(idx["name"])

    assert "idx_users_email_unique" in index_names

    # Insert user
    user_doc = {
        "_id": ObjectId(),
        "name": "Alice Developer",
        "email": "alice@example.com",
        "password_hash": "hashed_secret_string",
        "role": UserRole.USER.value,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await test_db[USERS_COLLECTION].insert_one(user_doc)

    # Attempt duplicate email insert -> must raise DuplicateKeyError
    duplicate_user = {
        "_id": ObjectId(),
        "name": "Another Alice",
        "email": "alice@example.com",
        "password_hash": "another_hash",
        "role": UserRole.USER.value,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    with pytest.raises(DuplicateKeyError):
        await test_db[USERS_COLLECTION].insert_one(duplicate_user)


@pytest.mark.asyncio
async def test_tasks_collection_indexes_and_creation(test_db):
    """Test that tasks collection has required indexes and can store tasks with creator and assignee ObjectIds."""
    # Verify index names
    index_names = []
    cursor = await test_db[TASKS_COLLECTION].list_indexes()
    async for idx in cursor:
        index_names.append(idx["name"])

    assert "idx_tasks_creator_id" in index_names
    assert "idx_tasks_assignee_id" in index_names
    assert "idx_tasks_status" in index_names
    assert "idx_tasks_priority" in index_names
    assert "idx_tasks_due_date" in index_names

    creator_id = ObjectId()
    assignee_id = ObjectId()
    now = datetime.now(timezone.utc)

    task_doc = {
        "_id": ObjectId(),
        "title": "Set up MongoDB Connection",
        "description": "Initialize AsyncMongoClient and collection indexes",
        "status": TaskStatus.IN_PROGRESS.value,
        "priority": TaskPriority.HIGH.value,
        "due_date": now,
        "creator_id": creator_id,
        "assignee_id": assignee_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await test_db[TASKS_COLLECTION].insert_one(task_doc)
    assert result.inserted_id == task_doc["_id"]

    saved_task = await test_db[TASKS_COLLECTION].find_one({"_id": task_doc["_id"]})
    assert saved_task is not None
    assert saved_task["title"] == "Set up MongoDB Connection"
    assert saved_task["creator_id"] == creator_id
    assert saved_task["assignee_id"] == assignee_id
