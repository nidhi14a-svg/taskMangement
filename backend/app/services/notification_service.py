import logging
from datetime import datetime, timezone
from typing import Optional, Any
from bson import ObjectId
from fastapi import BackgroundTasks
from pymongo.asynchronous.database import AsyncDatabase
from app.models.notification import NOTIFICATIONS_COLLECTION
from app.models.user import USERS_COLLECTION
from app.models.enums import NotificationType
from app.services.email_service import EmailService, _format_due_date

logger = logging.getLogger(__name__)


class NotificationService:
    """Service handling creation and dispatch of in-app notifications and email alerts."""

    @staticmethod
    async def create_notification(
        db: AsyncDatabase,
        recipient_id: ObjectId | str,
        title: str,
        message: str,
        task_id: Optional[ObjectId | str] = None,
        notification_type: NotificationType = NotificationType.TASK_ASSIGNED,
    ) -> dict[str, Any]:
        """Inserts an in-app notification document into MongoDB."""
        now = datetime.now(timezone.utc)
        doc = {
            "_id": ObjectId(),
            "recipient_id": ObjectId(recipient_id),
            "title": title.strip(),
            "message": message.strip(),
            "task_id": ObjectId(task_id) if task_id else None,
            "type": notification_type.value if hasattr(notification_type, "value") else str(notification_type),
            "is_read": False,
            "created_at": now,
            "read_at": None,
        }
        await db[NOTIFICATIONS_COLLECTION].insert_one(doc)
        logger.info(f"In-app notification created for user {recipient_id}: '{title}'")
        return doc

    @classmethod
    async def notify_task_assignment(
        cls,
        db: AsyncDatabase,
        task_doc: dict[str, Any],
        assigner: Any,
        assignee_doc: dict[str, Any],
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> None:
        """
        Triggers in-app notification and email alert when a new task is assigned.
        Does not crash if email delivery fails.
        """
        assignee_id = assignee_doc.get("_id")
        if not assignee_id:
            return

        assigner_name = getattr(assigner, "name", None) or "Team Lead"
        task_title = task_doc.get("title", "Untitled Task")
        priority = task_doc.get("priority", "MEDIUM")
        due_str = _format_due_date(task_doc.get("due_date"))

        # 1. In-App Notification
        notification_message = (
            f"{assigner_name} assigned you the task '{task_title}'. "
            f"Priority: {priority}. Due date: {due_str}."
        )
        await cls.create_notification(
            db=db,
            recipient_id=assignee_id,
            title="New task assigned",
            message=notification_message,
            task_id=task_doc.get("_id"),
            notification_type=NotificationType.TASK_ASSIGNED,
        )

        # 2. Email Delivery (background task if available)
        recipient_email = assignee_doc.get("email")
        recipient_name = assignee_doc.get("name", "Team Member")
        if recipient_email:
            email_args = {
                "recipient_email": recipient_email,
                "recipient_name": recipient_name,
                "task_title": task_title,
                "assigned_by": assigner_name,
                "priority": priority,
                "due_date": task_doc.get("due_date"),
                "task_description": task_doc.get("description"),
                "task_id": str(task_doc.get("_id")),
            }
            if background_tasks:
                background_tasks.add_task(EmailService.send_task_assignment_email, **email_args)
            else:
                EmailService.send_task_assignment_email(**email_args)

    @classmethod
    async def notify_task_updates(
        cls,
        db: AsyncDatabase,
        old_task: dict[str, Any],
        updated_task: dict[str, Any],
        modifier: Any,
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> None:
        """
        Evaluates task delta and triggers appropriate notifications only when relevant fields change:
        - Task reassigned: Notifies new assignee (in-app + email) and previous assignee (in-app).
        - Priority changed: Notifies current assignee (in-app + email).
        - Due date changed: Notifies current assignee (in-app).
        """
        modifier_name = getattr(modifier, "name", None) or "Team Lead"
        task_title = updated_task.get("title", old_task.get("title", "Task"))
        task_id = updated_task.get("_id")

        old_assignee_id = old_task.get("assignee_id")
        new_assignee_id = updated_task.get("assignee_id")
        old_assignee_str = str(old_assignee_id) if old_assignee_id else None
        new_assignee_str = str(new_assignee_id) if new_assignee_id else None

        # Scenario A & B: Assignment Changed
        if old_assignee_str != new_assignee_str:
            # 1. Notify new assignee
            if new_assignee_id:
                new_assignee_doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(new_assignee_id)})
                if new_assignee_doc:
                    is_first_assignment = old_assignee_id is None
                    title = "New task assigned" if is_first_assignment else "Task reassigned to you"
                    due_str = _format_due_date(updated_task.get("due_date"))
                    priority = updated_task.get("priority", "MEDIUM")

                    msg = (
                        f"{modifier_name} assigned you the task '{task_title}'. "
                        f"Priority: {priority}. Due date: {due_str}."
                        if is_first_assignment
                        else f"{modifier_name} reassigned the task '{task_title}' to you. "
                             f"Priority: {priority}. Due date: {due_str}."
                    )
                    ntype = NotificationType.TASK_ASSIGNED if is_first_assignment else NotificationType.TASK_REASSIGNED
                    await cls.create_notification(
                        db=db,
                        recipient_id=new_assignee_id,
                        title=title,
                        message=msg,
                        task_id=task_id,
                        notification_type=ntype,
                    )

                    # Email to new assignee
                    email_func = (
                        EmailService.send_task_assignment_email
                        if is_first_assignment
                        else EmailService.send_task_reassignment_email
                    )
                    email_kwargs = {
                        "recipient_email": new_assignee_doc.get("email"),
                        "recipient_name": new_assignee_doc.get("name", "Team Member"),
                        "task_title": task_title,
                        ("assigned_by" if is_first_assignment else "reassigned_by"): modifier_name,
                        "priority": priority,
                        "due_date": updated_task.get("due_date"),
                        "task_description": updated_task.get("description"),
                        "task_id": str(task_id),
                    }
                    if background_tasks:
                        background_tasks.add_task(email_func, **email_kwargs)
                    else:
                        email_func(**email_kwargs)

            # 2. Notify previous assignee that task was reassigned
            if old_assignee_id and new_assignee_id:
                await cls.create_notification(
                    db=db,
                    recipient_id=old_assignee_id,
                    title="Task reassigned",
                    message=f"The task '{task_title}' was reassigned to another team member by {modifier_name}.",
                    task_id=task_id,
                    notification_type=NotificationType.TASK_REASSIGNED,
                )
            return

        # Scenario C: Priority changed (and assignee did not change)
        old_priority = old_task.get("priority")
        new_priority = updated_task.get("priority")
        if old_priority != new_priority and new_assignee_id:
            assignee_doc = await db[USERS_COLLECTION].find_one({"_id": ObjectId(new_assignee_id)})
            if assignee_doc:
                await cls.create_notification(
                    db=db,
                    recipient_id=new_assignee_id,
                    title="Task priority updated",
                    message=f"{modifier_name} updated the priority of task '{task_title}' from {old_priority} to {new_priority}.",
                    task_id=task_id,
                    notification_type=NotificationType.TASK_PRIORITY_CHANGED,
                )
                email_kwargs = {
                    "recipient_email": assignee_doc.get("email"),
                    "recipient_name": assignee_doc.get("name", "Team Member"),
                    "task_title": task_title,
                    "old_priority": str(old_priority),
                    "new_priority": str(new_priority),
                    "updated_by": modifier_name,
                    "task_id": str(task_id),
                }
                if background_tasks:
                    background_tasks.add_task(EmailService.send_task_priority_changed_email, **email_kwargs)
                else:
                    EmailService.send_task_priority_changed_email(**email_kwargs)

        # Scenario D: Due date changed (and assignee did not change)
        old_due = old_task.get("due_date")
        new_due = updated_task.get("due_date")
        if old_due != new_due and new_assignee_id:
            new_due_str = _format_due_date(new_due)
            await cls.create_notification(
                db=db,
                recipient_id=new_assignee_id,
                title="Task due date updated",
                message=f"{modifier_name} updated the due date for task '{task_title}' to {new_due_str}.",
                task_id=task_id,
                notification_type=NotificationType.TASK_DUE_DATE_CHANGED,
            )
