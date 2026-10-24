from datetime import datetime
from typing import Optional, List
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict
from app.core.object_id import PyObjectId
from app.models.enums import NotificationType


class NotificationResponse(BaseModel):
    """Public representation of an in-app notification document."""

    id: PyObjectId = Field(alias="_id")
    recipient_id: PyObjectId
    title: str
    message: str
    task_id: Optional[PyObjectId] = None
    type: NotificationType = NotificationType.TASK_ASSIGNED
    is_read: bool = False
    created_at: datetime
    read_at: Optional[datetime] = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class NotificationListResponse(BaseModel):
    """Paginated list of notifications for the authenticated user."""

    items: List[NotificationResponse]
    total: int
    unread_count: int
    page: int
    page_size: int
    total_pages: int


class UnreadCountResponse(BaseModel):
    """Unread notifications tally."""

    unread_count: int
