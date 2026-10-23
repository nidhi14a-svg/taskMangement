from typing import Optional, Any
from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase
from app.models.task import TASKS_COLLECTION


class TaskService:
    """Straightforward MongoDB operations for tasks."""

    @staticmethod
    async def get_by_id(db: AsyncDatabase, task_id: Any) -> Optional[dict]:
        oid = ObjectId(task_id) if isinstance(task_id, str) and ObjectId.is_valid(task_id) else task_id
        return await db[TASKS_COLLECTION].find_one({"_id": oid})
