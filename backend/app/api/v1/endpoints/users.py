from typing import Optional, Any
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.asynchronous.database import AsyncDatabase

from app.core.database import get_database
from app.models.user import USERS_COLLECTION
from app.models.enums import UserRole
from app.schemas.user import UserResponse, UserUpdate
from app.api.dependencies import get_current_user, require_admin

router = APIRouter()


@router.get(
    "",
    response_model=list[UserResponse],
    summary="List Users Directory",
    description="Returns authorized user directory. ADMIN views all; TEAM_LEAD views members in their department; EMPLOYEE views departmental teammates.",
)
@router.get("/", response_model=list[UserResponse], include_in_schema=False)
async def list_users_directory(
    department: Optional[str] = Query(None, description="Filter users by department"),
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> list[UserResponse]:
    """
    Retrieves authorized users directory:
    - ADMIN can view all users or filter by department.
    - TEAM_LEAD can only view members within their authorized department.
    - EMPLOYEE/USER can view department teammates or self.
    """
    query: dict[str, Any] = {}

    if current_user.role == UserRole.ADMIN:
        if department:
            query["department"] = department
    elif current_user.role == UserRole.TEAM_LEAD:
        # Team lead is strictly scoped to their department
        lead_dept = current_user.department or ""
        if lead_dept:
            query["department"] = lead_dept
        else:
            query["_id"] = ObjectId(current_user.id)
    else:
        # Employee view: teammates in same department if configured
        if current_user.department:
            query["department"] = current_user.department

    cursor = db[USERS_COLLECTION].find(query, {"password_hash": 0}).sort("name", 1)
    user_docs = await cursor.to_list(length=1000)
    return [UserResponse.model_validate(doc) for doc in user_docs]


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user profile by ID",
    description="Retrieves a specific user. ADMIN can view any user; TEAM_LEAD can only view users in their department.",
)
async def get_user_by_id(
    user_id: str,
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid user ID format: '{user_id}'.",
        )

    user_doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found.",
        )

    # Scoping for TEAM_LEAD
    if current_user.role == UserRole.TEAM_LEAD:
        lead_dept = (current_user.department or "").strip().lower()
        user_dept = (user_doc.get("department") or "").strip().lower()
        is_self = str(user_doc["_id"]) == str(current_user.id)
        if not is_self and (not lead_dept or lead_dept != user_dept):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team leads can only access members of their authorized department.",
            )

    return UserResponse.model_validate(user_doc)


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update User Role / Department (ADMIN Only)",
    description="Allows administrator to update a user's role, position, department, or profile information.",
)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncDatabase = Depends(get_database),
    admin_user: UserResponse = Depends(require_admin),
) -> UserResponse:
    """
    Updates user details. Restricted to ADMIN role.
    """
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid user ID format: '{user_id}'.",
        )

    existing = await db[USERS_COLLECTION].find_one({"_id": ObjectId(user_id)})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found.",
        )

    update_fields: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if payload.name is not None:
        update_fields["name"] = payload.name.strip()
    if payload.role is not None:
        update_fields["role"] = payload.role.value
    if payload.department is not None:
        update_fields["department"] = payload.department.strip()
    if payload.position is not None:
        update_fields["position"] = payload.position.strip()

    await db[USERS_COLLECTION].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_fields},
    )

    updated_doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(user_id)})
    return UserResponse.model_validate(updated_doc)
