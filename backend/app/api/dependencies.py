from typing import Optional
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from pymongo.asynchronous.database import AsyncDatabase
from app.core.database import get_database
from app.core.security import decode_access_token
from app.models.user import USERS_COLLECTION
from app.models.enums import UserRole
from app.schemas.user import UserResponse

security_bearer = HTTPBearer(auto_error=False)


async def get_current_user_doc(
    db: AsyncDatabase = Depends(get_database),
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> dict:
    """
    Decodes the JWT bearer token, verifies signature and expiry, and fetches
    the authenticated user directly from the MongoDB database.
    Never trusts client-supplied user IDs or roles.
    """
    if not auth_header or not auth_header.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth_header.credentials

    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str or not ObjectId.is_valid(user_id_str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(user_id_str)})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_doc


async def get_current_user(
    user_doc: dict = Depends(get_current_user_doc),
) -> UserResponse:
    """
    Dependency providing the authenticated user's safe public profile.
    Never exposes password_hash.
    """
    return UserResponse.model_validate(user_doc)


async def require_admin(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """
    Dependency enforcing ADMIN role access control.
    Returns HTTP 403 Forbidden for authenticated users lacking the ADMIN role.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator permissions required to perform this action.",
        )
    return current_user


async def require_team_lead(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """
    Dependency enforcing TEAM_LEAD or ADMIN role access control.
    Returns HTTP 403 Forbidden for users lacking TEAM_LEAD or ADMIN role.
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.TEAM_LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team Lead or Administrator permissions required to perform this action.",
        )
    return current_user


def require_roles(*allowed_roles: UserRole):
    """
    Factory dependency checking that user has one of allowed roles.
    ADMIN is always granted access.
    """
    async def role_checker(
        current_user: UserResponse = Depends(get_current_user),
    ) -> UserResponse:
        user_role = UserRole.EMPLOYEE if current_user.role == UserRole.USER else current_user.role
        allowed = {UserRole.EMPLOYEE if r == UserRole.USER else r for r in allowed_roles}
        if current_user.role != UserRole.ADMIN and user_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {[r.value for r in allowed_roles]}.",
            )
        return current_user

    return role_checker
