import logging
from typing import Optional, Tuple
from fastapi import Request, HTTPException, status
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError, ConnectionFailure
from app.core.config import settings
from app.models.user import USERS_COLLECTION
from app.models.task import TASKS_COLLECTION
from app.models.notification import NOTIFICATIONS_COLLECTION

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages the lifecycle of the PyMongo AsyncMongoClient and AsyncDatabase."""

    client: Optional[AsyncMongoClient] = None
    db: Optional[AsyncDatabase] = None


db_manager = DatabaseManager()


async def init_db_indexes(db: AsyncDatabase) -> None:
    """
    Ensures required indexes are created on users and tasks collections:
    - Users: Unique index on email.
    - Tasks: Indexes on creator_id, assignee_id, status, priority, and due_date.
    """
    try:
        # 1. Unique email index on users collection
        await db[USERS_COLLECTION].create_index(
            [("email", 1)],
            unique=True,
            name="idx_users_email_unique",
        )
        logger.info("MongoDB index verified: users.email (unique)")

        # 2. Indexes on tasks collection
        await db[TASKS_COLLECTION].create_index([("creator_id", 1)], name="idx_tasks_creator_id")
        await db[TASKS_COLLECTION].create_index([("assignee_id", 1)], name="idx_tasks_assignee_id")
        await db[TASKS_COLLECTION].create_index([("status", 1)], name="idx_tasks_status")
        await db[TASKS_COLLECTION].create_index([("priority", 1)], name="idx_tasks_priority")
        await db[TASKS_COLLECTION].create_index([("due_date", 1)], name="idx_tasks_due_date")
        logger.info("MongoDB indexes verified: tasks (creator_id, assignee_id, status, priority, due_date)")

        # 3. Indexes on notifications collection
        await db[NOTIFICATIONS_COLLECTION].create_index(
            [("recipient_id", 1), ("is_read", 1), ("created_at", -1)],
            name="idx_notifications_recipient_unread",
        )
        await db[NOTIFICATIONS_COLLECTION].create_index(
            [("recipient_id", 1), ("created_at", -1)],
            name="idx_notifications_recipient_created",
        )
        await db[NOTIFICATIONS_COLLECTION].create_index(
            [("task_id", 1)],
            name="idx_notifications_task_id",
        )
        logger.info("MongoDB indexes verified: notifications (recipient_id, is_read, created_at, task_id)")
    except Exception as exc:
        logger.error(f"Error ensuring MongoDB indexes: {exc.__class__.__name__}")


async def connect_to_mongo(app=None) -> None:
    """
    Initializes the PyMongo AsyncMongoClient and AsyncDatabase.
    Called during FastAPI lifespan startup.
    Handles connection errors gracefully without crashing the application or exposing credentials.
    """
    logger.info("Connecting to MongoDB...")
    try:
        # Configure client with 2000ms server selection timeout for fast offline detection
        client = AsyncMongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=2000,
        )
        db = client[settings.MONGODB_DB_NAME]

        # Verify connectivity with ping command
        await client.admin.command("ping")
        logger.info(f"Successfully connected to MongoDB database '{settings.MONGODB_DB_NAME}'.")

        db_manager.client = client
        db_manager.db = db

        if app is not None:
            app.state.mongo_client = client
            app.state.db = db

        # Ensure collection indexes are created
        await init_db_indexes(db)
    except (ConnectionFailure, ServerSelectionTimeoutError, PyMongoError) as exc:
        logger.warning(
            f"Could not establish initial MongoDB connection: {exc.__class__.__name__}. "
            "Application will run in degraded mode until MongoDB is available."
        )


async def close_mongo_connection(app=None) -> None:
    """Closes the MongoDB async connection pool during application shutdown."""
    logger.info("Closing MongoDB connection pool...")
    if db_manager.client is not None:
        await db_manager.client.close()
        db_manager.client = None
        db_manager.db = None
    if app is not None and hasattr(app.state, "mongo_client") and app.state.mongo_client:
        await app.state.mongo_client.close()
        app.state.mongo_client = None
        app.state.db = None
    logger.info("MongoDB connection closed cleanly.")


async def get_database(request: Request) -> AsyncDatabase:
    """
    FastAPI dependency for route handlers to access the active MongoDB AsyncDatabase.
    Raises HTTP 503 if the database is currently unreachable.
    """
    if hasattr(request.app.state, "db") and request.app.state.db is not None:
        return request.app.state.db

    if db_manager.db is not None:
        return db_manager.db

    if db_manager.client is not None:
        return db_manager.client[settings.MONGODB_DB_NAME]

    # Attempt auto-connection if lifespan hasn't initialized client yet
    await connect_to_mongo(getattr(request, "app", None))
    if db_manager.db is not None:
        return db_manager.db

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Database connection is unavailable.",
    )


def get_db() -> Optional[AsyncDatabase]:
    """Helper to access the current AsyncDatabase instance directly."""
    return db_manager.db


async def check_mongo_connection() -> Tuple[bool, str]:
    """
    Safely tests MongoDB connectivity using admin 'ping'.
    Returns (True, 'connected') or (False, 'unreachable (<ErrorClass>)').
    Never exposes credentials, passwords, or URI parameters in responses or logs.
    """
    client_to_check = db_manager.client
    temporary_client = False

    try:
        if client_to_check is None:
            # Create a quick testing client if lifespan hasn't initialized it yet
            client_to_check = AsyncMongoClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=1500,
            )
            temporary_client = True

        await client_to_check.admin.command("ping")
        return True, "connected"
    except Exception as exc:
        # If bound client failed (e.g. created on a different event loop), try a fresh client in this loop
        if not temporary_client:
            try:
                temp_client = AsyncMongoClient(
                    settings.MONGODB_URI,
                    serverSelectionTimeoutMS=1500,
                )
                await temp_client.admin.command("ping")
                await temp_client.close()
                return True, "connected"
            except Exception:
                pass
        return False, f"unreachable ({exc.__class__.__name__})"
    finally:
        if temporary_client and client_to_check is not None:
            await client_to_check.close()
