from typing import Optional, Any
from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase
from app.models.user import USERS_COLLECTION


class UserService:
    """Straightforward MongoDB operations for users."""

    @staticmethod
    async def get_by_id(db: AsyncDatabase, user_id: Any) -> Optional[dict]:
        oid = ObjectId(user_id) if isinstance(user_id, str) and ObjectId.is_valid(user_id) else user_id
        return await db[USERS_COLLECTION].find_one({"_id": oid})

    @staticmethod
    async def get_by_email(db: AsyncDatabase, email: str) -> Optional[dict]:
        normalized = email.strip().lower()
        return await db[USERS_COLLECTION].find_one({"email": normalized})
