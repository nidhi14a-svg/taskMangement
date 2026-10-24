import logging
import smtplib
from email.message import EmailMessage
from datetime import datetime
from typing import Tuple, Optional, Any
from app.core.config import settings

logger = logging.getLogger(__name__)


def _format_due_date(due_date: Any) -> str:
    """Safely formats a datetime object or ISO string to a human-readable date."""
    if not due_date:
        return "No due date specified"
    try:
        if isinstance(due_date, str):
            clean_str = due_date.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
        elif isinstance(due_date, datetime):
            dt = due_date
        else:
            return str(due_date)
        return dt.strftime("%d %B %Y")
    except Exception:
        return str(due_date)


class EmailService:
    """
    Deterministic email notification delivery service.
    Directly checks whether SMTP credentials are configured before attempting delivery.
    Never falsely reports successful transmission or logs secrets.
    """

    @staticmethod
    def is_configured() -> bool:
        """Returns True only if valid SMTP connection credentials are provided in settings."""
        username = settings.SMTP_USER or settings.SMTP_USERNAME
        return bool(settings.SMTP_HOST and username and settings.SMTP_PASSWORD)

    @classmethod
    def _dispatch_smtp(cls, msg: EmailMessage, recipient_email: str) -> Tuple[bool, str]:
        """Internal helper to dispatch an EmailMessage over SMTP safely."""
        if not cls.is_configured():
            return (False, "Email delivery is not configured.")

        username = settings.SMTP_USER or settings.SMTP_USERNAME
        from_email = settings.SMTP_FROM_EMAIL or settings.EMAILS_FROM_EMAIL or "no-reply@taskflow.dev"
        if not msg.get("From"):
            msg["From"] = f"{settings.EMAILS_FROM_NAME} <{from_email}>"

        try:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(username, settings.SMTP_PASSWORD)
                server.send_message(msg)
            return (True, f"Email delivered to {recipient_email}")
        except Exception as e:
            # Safely log without exposing SMTP credentials or passwords
            logger.error(f"Failed to send email to {recipient_email}: {type(e).__name__} - {str(e)}")
            return (False, f"SMTP delivery failed: {str(e)}")

    @classmethod
    def send_invitation_email(
        cls,
        recipient_email: str,
        recipient_name: str,
        activation_token: str,
    ) -> Tuple[bool, str]:
        """Sends account activation invitation link to an imported employee."""
        if not cls.is_configured():
            return (
                False,
                "Email delivery is not configured. Configure SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in environment variables to enable automated emails.",
            )

        activation_url = f"{settings.FRONTEND_URL}/activate?token={activation_token}"

        msg = EmailMessage()
        msg["Subject"] = f"Welcome to TaskFlow, {recipient_name}! Activate Your Account"
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = recipient_email

        text_content = (
            f"Hello {recipient_name},\n\n"
            f"You have been invited to join TaskFlow.\n"
            f"Please click the link below to set your password and activate your account:\n\n"
            f"{activation_url}\n\n"
            f"This activation link will expire in 7 days.\n\n"
            f"— TaskFlow Administration"
        )
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="margin-bottom: 20px;">
                <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px;">Welcome to TaskFlow</h2>
                <p style="color: #64748b; font-size: 14px; margin: 0;">You have been invited to join your organization's TaskFlow workspace.</p>
            </div>
            <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
                <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">Hello <strong>{recipient_name}</strong>,</p>
                <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">Your employee account has been provisioned. Click the button below to establish your password securely:</p>
                <a href="{activation_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 10px 22px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">Activate My Account</a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">If the button above does not work, copy and paste this link into your browser:<br/><a href="{activation_url}" style="color: #4f46e5;">{activation_url}</a></p>
        </div>
        """

        msg.set_content(text_content)
        msg.add_alternative(html_content, subtype="html")
        return cls._dispatch_smtp(msg, recipient_email)

    @classmethod
    def send_task_assignment_email(
        cls,
        recipient_email: str,
        recipient_name: str,
        task_title: str,
        assigned_by: str,
        priority: str = "MEDIUM",
        due_date: Optional[Any] = None,
        task_description: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Sends rich HTML & plaintext email notification when a new task is assigned."""
        if not cls.is_configured():
            return (False, "Email delivery not configured; in-app notification recorded.")

        formatted_due = _format_due_date(due_date)
        task_url = f"{settings.FRONTEND_URL}/tasks?taskId={task_id}" if task_id else f"{settings.FRONTEND_URL}/tasks?filter=assigned"
        description_text = task_description.strip() if task_description else "No description provided."

        msg = EmailMessage()
        msg["Subject"] = f"New Task Assigned: {task_title}"
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = recipient_email

        text_content = (
            f"Hello {recipient_name},\n\n"
            f"{assigned_by} has assigned you a new task in TaskFlow:\n\n"
            f"Title: {task_title}\n"
            f"Priority: {priority}\n"
            f"Due Date: {formatted_due}\n"
            f"Description: {description_text}\n\n"
            f"View task in TaskFlow: {task_url}\n\n"
            f"— TaskFlow Team"
        )

        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="margin-bottom: 20px;">
                <div style="display: inline-block; background-color: #eef2ff; color: #4f46e5; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; letter-spacing: 0.5px; margin-bottom: 8px;">Task Assigned</div>
                <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 20px; font-weight: 700;">{task_title}</h2>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Assigned by <strong>{assigned_by}</strong></p>
            </div>

            <div style="padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; width: 100px;">Priority:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">{priority}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b;">Due Date:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">{formatted_due}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; vertical-align: top;">Description:</td>
                        <td style="padding: 6px 0; color: #334155; line-height: 1.5;">{description_text}</td>
                    </tr>
                </table>
            </div>

            <div style="text-align: left; margin-bottom: 20px;">
                <a href="{task_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 10px 22px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">Open Task in TaskFlow</a>
            </div>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                This automated notification was generated by TaskFlow. You received this because you were assigned this deliverable.
            </p>
        </div>
        """

        msg.set_content(text_content)
        msg.add_alternative(html_content, subtype="html")
        return cls._dispatch_smtp(msg, recipient_email)

    @classmethod
    def send_task_reassignment_email(
        cls,
        recipient_email: str,
        recipient_name: str,
        task_title: str,
        reassigned_by: str,
        priority: str = "MEDIUM",
        due_date: Optional[Any] = None,
        task_description: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Sends email when a task is reassigned to an employee."""
        if not cls.is_configured():
            return (False, "Email delivery not configured; in-app notification recorded.")

        formatted_due = _format_due_date(due_date)
        task_url = f"{settings.FRONTEND_URL}/tasks?taskId={task_id}" if task_id else f"{settings.FRONTEND_URL}/tasks?filter=assigned"
        description_text = task_description.strip() if task_description else "No description provided."

        msg = EmailMessage()
        msg["Subject"] = f"Task Reassigned: {task_title}"
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = recipient_email

        text_content = (
            f"Hello {recipient_name},\n\n"
            f"{reassigned_by} has reassigned a task to you in TaskFlow:\n\n"
            f"Title: {task_title}\n"
            f"Priority: {priority}\n"
            f"Due Date: {formatted_due}\n"
            f"Description: {description_text}\n\n"
            f"View task in TaskFlow: {task_url}\n\n"
            f"— TaskFlow Team"
        )

        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="margin-bottom: 20px;">
                <div style="display: inline-block; background-color: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; letter-spacing: 0.5px; margin-bottom: 8px;">Task Reassigned</div>
                <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 20px; font-weight: 700;">{task_title}</h2>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Reassigned to you by <strong>{reassigned_by}</strong></p>
            </div>

            <div style="padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; width: 100px;">Priority:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">{priority}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b;">Due Date:</td>
                        <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">{formatted_due}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; color: #64748b; vertical-align: top;">Description:</td>
                        <td style="padding: 6px 0; color: #334155; line-height: 1.5;">{description_text}</td>
                    </tr>
                </table>
            </div>

            <div style="text-align: left; margin-bottom: 20px;">
                <a href="{task_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 10px 22px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">View Reassigned Task</a>
            </div>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                This automated notification was generated by TaskFlow.
            </p>
        </div>
        """

        msg.set_content(text_content)
        msg.add_alternative(html_content, subtype="html")
        return cls._dispatch_smtp(msg, recipient_email)

    @classmethod
    def send_task_priority_changed_email(
        cls,
        recipient_email: str,
        recipient_name: str,
        task_title: str,
        old_priority: str,
        new_priority: str,
        updated_by: str,
        task_id: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Sends email when a task priority is modified."""
        if not cls.is_configured():
            return (False, "Email delivery not configured; in-app notification recorded.")

        task_url = f"{settings.FRONTEND_URL}/tasks?taskId={task_id}" if task_id else f"{settings.FRONTEND_URL}/tasks?filter=assigned"

        msg = EmailMessage()
        msg["Subject"] = f"Task Priority Updated: {task_title}"
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = recipient_email

        text_content = (
            f"Hello {recipient_name},\n\n"
            f"{updated_by} updated the priority for your assigned task '{task_title}'.\n\n"
            f"Previous Priority: {old_priority}\n"
            f"New Priority: {new_priority}\n\n"
            f"View task in TaskFlow: {task_url}\n\n"
            f"— TaskFlow Team"
        )

        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="margin-bottom: 20px;">
                <div style="display: inline-block; background-color: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; letter-spacing: 0.5px; margin-bottom: 8px;">Priority Updated</div>
                <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 20px; font-weight: 700;">{task_title}</h2>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Updated by <strong>{updated_by}</strong></p>
            </div>

            <div style="padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px; color: #334155;">
                    The priority of this task was changed from <span style="font-weight: 600; color: #64748b;">{old_priority}</span> to <span style="font-weight: 700; color: #dc2626;">{new_priority}</span>.
                </p>
            </div>

            <div style="text-align: left; margin-bottom: 20px;">
                <a href="{task_url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 10px 22px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">Open Task in TaskFlow</a>
            </div>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                This automated notification was generated by TaskFlow.
            </p>
        </div>
        """

        msg.set_content(text_content)
        msg.add_alternative(html_content, subtype="html")
        return cls._dispatch_smtp(msg, recipient_email)
