from typing import Optional, Any
from bson import ObjectId
from app.core.security import verify_password, create_access_token


class AuthService:
    """Authentication and token utilities."""

    @staticmethod
    def create_user_token(user_id: Any) -> str:
        return create_access_token(subject=str(user_id))
