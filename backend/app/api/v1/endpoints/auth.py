from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import USERS_COLLECTION
from app.models.enums import UserRole
from app.schemas.user import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    LoginResponse,
)
from app.api.dependencies import get_current_user, require_admin

router = APIRouter()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Registers a new user account with default USER role. Email addresses are normalized. Passwords are encrypted using Argon2id.",
)
async def register(
    payload: UserRegisterRequest,
    db: AsyncDatabase = Depends(get_database),
) -> UserResponse:
    """
    Public registration endpoint.
    - Validates inputs and normalizes email address.
    - Hashes password using Argon2id.
    - Rejects duplicate email addresses with HTTP 409.
    - Assigns USER as the default role (never allows creating an ADMIN).
    - Returns safe public user profile without password hash.
    """
    # Check for existing user with identical normalized email
    existing_user = await db[USERS_COLLECTION].find_one({"email": payload.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )

    now = datetime.now(timezone.utc)
    new_user_id = ObjectId()

    # Public registration strictly defaults to USER role; never allow ADMIN
    user_doc = {
        "_id": new_user_id,
        "name": payload.name,
        "email": payload.email,
        "password_hash": get_password_hash(payload.password),
        "role": UserRole.USER.value,
        "created_at": now,
        "updated_at": now,
    }

    try:
        await db[USERS_COLLECTION].insert_one(user_doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )

    return UserResponse.model_validate(user_doc)


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="User Login",
    description="Authenticates credentials and returns a signed JWT access token along with the safe user profile.",
)
async def login(
    payload: UserLoginRequest,
    db: AsyncDatabase = Depends(get_database),
) -> LoginResponse:
    """
    Authenticates user by email and password.
    - Checks user existence and verifies Argon2id password hash.
    - Returns HTTP 401 for invalid credentials.
    - Emits a signed JWT bearer token with expiration.
    """
    user_doc = await db[USERS_COLLECTION].find_one({"email": payload.email})
    if not user_doc or not verify_password(payload.password, user_doc.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        subject=user_doc["_id"],
        extra_claims={"role": user_doc["role"]},
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user_doc),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
    description="Returns the profile of the currently authenticated user identified by the Bearer JWT token.",
)
async def get_current_user_profile(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """
    Returns the authenticated user's public profile.
    Requires a valid, non-expired Bearer JWT token in Authorization header.
    """
    return current_user


@router.get(
    "/admin-check",
    response_model=dict,
    summary="Admin Role Verification",
    description="Test endpoint requiring ADMIN role. Returns HTTP 200 for admins, HTTP 403 for non-admin users.",
)
async def verify_admin_role(
    admin_user: UserResponse = Depends(require_admin),
) -> dict:
    """
    RBAC verification endpoint.
    Restricted to users with ADMIN role.
    """
    return {
        "status": "authorized",
        "message": f"Administrator privilege confirmed for {admin_user.name}.",
        "admin_id": str(admin_user.id),
        "role": admin_user.role.value,
    }
