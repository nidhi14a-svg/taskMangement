import math
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.asynchronous.database import AsyncDatabase
from app.core.database import get_database
from app.api.dependencies import get_current_user
from app.models.notification import NOTIFICATIONS_COLLECTION
from app.schemas.user import UserResponse
from app.schemas.notification import (
    NotificationResponse,
    NotificationListResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List Notifications",
    description="Returns paginated notifications for the currently authenticated user.",
)
async def list_notifications(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    unread_only: bool = Query(False, description="Filter to unread notifications only"),
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> NotificationListResponse:
    """Fetches user-specific notifications strictly filtered by recipient_id."""
    user_oid = ObjectId(current_user.id)
    query: dict = {"recipient_id": user_oid}
    if unread_only:
        query["is_read"] = False

    total = await db[NOTIFICATIONS_COLLECTION].count_documents(query)
    unread_count = await db[NOTIFICATIONS_COLLECTION].count_documents({
        "recipient_id": user_oid,
        "is_read": False,
    })

    skip = (page - 1) * limit
    cursor = db[NOTIFICATIONS_COLLECTION].find(query).sort([("created_at", -1)]).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)

    total_pages = math.ceil(total / limit) if total > 0 else 0
    items = [NotificationResponse.model_validate(doc) for doc in docs]

    return NotificationListResponse(
        items=items,
        total=total,
        unread_count=unread_count,
        page=page,
        page_size=limit,
        total_pages=total_pages,
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    summary="Get Unread Notification Count",
    description="Returns the total number of unread notifications for the active user session.",
)
async def get_unread_count(
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> UnreadCountResponse:
    """Lightweight endpoint for periodic polling of unread badge count."""
    user_oid = ObjectId(current_user.id)
    count = await db[NOTIFICATIONS_COLLECTION].count_documents({
        "recipient_id": user_oid,
        "is_read": False,
    })
    return UnreadCountResponse(unread_count=count)


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark Notification as Read",
    description="Marks a specific notification belonging to the current user as read.",
)
async def mark_notification_as_read(
    notification_id: str,
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> NotificationResponse:
    """Marks a single notification read after validating user ownership."""
    if not ObjectId.is_valid(notification_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid notification ID format: '{notification_id}'.",
        )

    user_oid = ObjectId(current_user.id)
    notif_oid = ObjectId(notification_id)

    # Prevent IDOR by asserting recipient_id matches current user
    notif_doc = await db[NOTIFICATIONS_COLLECTION].find_one({"_id": notif_oid})
    if not notif_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    if str(notif_doc.get("recipient_id")) != str(user_oid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You cannot modify or access another user's notifications.",
        )

    now = datetime.now(timezone.utc)
    await db[NOTIFICATIONS_COLLECTION].update_one(
        {"_id": notif_oid},
        {"$set": {"is_read": True, "read_at": now}},
    )

    updated_doc = await db[NOTIFICATIONS_COLLECTION].find_one({"_id": notif_oid})
    return NotificationResponse.model_validate(updated_doc)


@router.post(
    "/mark-all-read",
    summary="Mark All Notifications as Read",
    description="Marks all unread notifications for the authenticated user as read.",
)
async def mark_all_notifications_as_read(
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    """Bulk updates all unread notifications for the active user."""
    user_oid = ObjectId(current_user.id)
    now = datetime.now(timezone.utc)

    result = await db[NOTIFICATIONS_COLLECTION].update_many(
        {"recipient_id": user_oid, "is_read": False},
        {"$set": {"is_read": True, "read_at": now}},
    )

    return {
        "status": "success",
        "message": "All notifications marked as read.",
        "updated_count": result.modified_count,
    }
