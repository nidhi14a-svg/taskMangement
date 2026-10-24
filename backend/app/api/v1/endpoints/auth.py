import uuid
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.core.database import get_database
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import USERS_COLLECTION, INVITATIONS_COLLECTION, ACTIVATION_TOKENS_COLLECTION
from app.models.enums import UserRole, AccountStatus
from app.schemas.user import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    LoginResponse,
    InvitationCreateRequest,
    InvitationResponse,
    AccountActivateRequest,
    AccountActivateVerifyResponse,
)
from app.api.dependencies import get_current_user, require_admin

router = APIRouter()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Registers a new user with role verification. EMPLOYEE is standard, TEAM_LEAD requires an approved invitation code. ADMIN cannot be self-registered.",
)
async def register(
    payload: UserRegisterRequest,
    db: AsyncDatabase = Depends(get_database),
) -> UserResponse:
    """
    Public registration endpoint:
    - Rejects any attempt to self-register as ADMIN (403 Forbidden).
    - Requires and verifies an approved invitation code for TEAM_LEAD registration.
    - Defaults to EMPLOYEE role.
    - Saves position and department alongside user details.
    """
    # 1. Reject attempts to self-register as ADMIN
    if payload.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration cannot assign ADMIN privileges. Use secure administrator provisioning.",
        )

    # 2. Check for duplicate email
    existing_user = await db[USERS_COLLECTION].find_one({"email": payload.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists.",
        )

    now = datetime.now(timezone.utc)
    department = payload.department
    position = payload.position
    assigned_role = UserRole.EMPLOYEE.value

    # 3. Verify TEAM_LEAD invitation
    if payload.role == UserRole.TEAM_LEAD:
        if not payload.invite_code or not payload.invite_code.strip():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="A valid organization invitation code is required to register as Team Lead.",
            )

        code_clean = payload.invite_code.strip()
        invite_doc = await db[INVITATIONS_COLLECTION].find_one({
            "code": code_clean,
            "is_used": False,
        })

        if invite_doc:
            await db[INVITATIONS_COLLECTION].update_one(
                {"_id": invite_doc["_id"]},
                {"$set": {"is_used": True, "used_at": now, "used_by": payload.email}},
            )
            department = department or invite_doc.get("department")
            assigned_role = UserRole.TEAM_LEAD.value
        elif code_clean == settings.TEAM_LEAD_INVITE_CODE:
            assigned_role = UserRole.TEAM_LEAD.value
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired invitation code for Team Lead registration.",
            )
    elif payload.role == UserRole.USER:
        assigned_role = UserRole.USER.value
    else:
        assigned_role = UserRole.EMPLOYEE.value

    new_user_id = ObjectId()
    user_doc = {
        "_id": new_user_id,
        "name": payload.name,
        "email": payload.email,
        "password_hash": get_password_hash(payload.password),
        "role": assigned_role,
        "position": position,
        "department": department,
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
    "/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Team Lead invitation code",
    description="Generates a unique invitation code for a Team Lead in a specific department. Requires ADMIN.",
)
async def create_invitation(
    payload: InvitationCreateRequest,
    db: AsyncDatabase = Depends(get_database),
    admin_user: UserResponse = Depends(require_admin),
) -> InvitationResponse:
    """
    Creates an invitation code for a Team Lead in an organization department.
    Restricted to ADMIN users.
    """
    now = datetime.now(timezone.utc)
    code = f"LEAD-{uuid.uuid4().hex[:8].upper()}"
    invitation_doc = {
        "_id": ObjectId(),
        "code": code,
        "role": payload.role.value,
        "department": payload.department,
        "created_by": str(admin_user.id),
        "is_used": False,
        "created_at": now,
    }
    await db[INVITATIONS_COLLECTION].insert_one(invitation_doc)
    return InvitationResponse.model_validate(invitation_doc)


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


@router.get(
    "/activate/verify",
    response_model=AccountActivateVerifyResponse,
    summary="Verify Employee Activation Token",
    description="Validates an account activation token and returns recipient name and email for the setup password screen.",
)
async def verify_activation_token(
    token: str = Query(..., min_length=1, description="Activation token from email"),
    db: AsyncDatabase = Depends(get_database),
) -> AccountActivateVerifyResponse:
    """Verifies that the activation token exists and has not expired."""
    clean_token = token.strip()
    now = datetime.now(timezone.utc)

    token_doc = await db[ACTIVATION_TOKENS_COLLECTION].find_one({
        "token": clean_token,
        "is_used": False,
        "expires_at": {"$gt": now},
    })

    if not token_doc:
        return AccountActivateVerifyResponse(
            valid=False,
            message="This activation link is invalid, expired, or has already been used.",
        )

    user_doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(token_doc["user_id"])})
    if not user_doc:
        return AccountActivateVerifyResponse(
            valid=False,
            message="Associated employee account not found.",
        )

    return AccountActivateVerifyResponse(
        valid=True,
        email=user_doc.get("email"),
        name=user_doc.get("name"),
        message="Token is valid. You may now set your password.",
    )


@router.post(
    "/activate",
    response_model=LoginResponse,
    summary="Activate Employee Account and Set Password",
    description="Allows invited employees to set their password, transitioning their status to ACTIVE and issuing an access token.",
)
async def activate_account(
    payload: AccountActivateRequest,
    db: AsyncDatabase = Depends(get_database),
) -> LoginResponse:
    """
    Consumes the activation token, sets employee password with secure Argon2id hash,
    updates status to ACTIVE, and logs the user in immediately.
    """
    clean_token = payload.token.strip()
    now = datetime.now(timezone.utc)

    token_doc = await db[ACTIVATION_TOKENS_COLLECTION].find_one({
        "token": clean_token,
        "is_used": False,
        "expires_at": {"$gt": now},
    })

    if not token_doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or previously consumed activation token.",
        )

    user_id = ObjectId(token_doc["user_id"])
    user_doc = await db[USERS_COLLECTION].find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated employee account not found.",
        )

    # Hash new password
    new_password_hash = get_password_hash(payload.password)

    # Mark token used
    await db[ACTIVATION_TOKENS_COLLECTION].update_one(
        {"_id": token_doc["_id"]},
        {"$set": {"is_used": True, "used_at": now}},
    )

    # Update user document: set password, activate status, clear token
    await db[USERS_COLLECTION].update_one(
        {"_id": user_id},
        {
            "$set": {
                "password_hash": new_password_hash,
                "status": AccountStatus.ACTIVE.value,
                "updated_at": now,
            },
            "$unset": {
                "activation_token": "",
                "activation_token_expires_at": "",
            },
        },
    )

    updated_user = await db[USERS_COLLECTION].find_one({"_id": user_id})

    # Generate session access token for seamless immediate login
    access_token = create_access_token(
        subject=str(updated_user["_id"]),
        extra_claims={"role": updated_user.get("role", UserRole.EMPLOYEE.value)},
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(updated_user),
    )

