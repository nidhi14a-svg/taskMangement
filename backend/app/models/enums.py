from enum import Enum


class UserRole(str, Enum):
    """User authorization roles."""
    ADMIN = "ADMIN"
    TEAM_LEAD = "TEAM_LEAD"
    EMPLOYEE = "EMPLOYEE"
    USER = "USER"  # Backward compatibility alias for EMPLOYEE


class TaskStatus(str, Enum):
    """Task workflow states."""
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class AccountStatus(str, Enum):
    """Employee account lifecycle state."""
    ACTIVE = "ACTIVE"
    INVITED = "INVITED"
    DEACTIVATED = "DEACTIVATED"


class TaskPriority(str, Enum):
    """Task urgency levels."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class NotificationType(str, Enum):
    """Notification trigger types."""
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_REASSIGNED = "TASK_REASSIGNED"
    TASK_PRIORITY_CHANGED = "TASK_PRIORITY_CHANGED"
    TASK_DUE_DATE_CHANGED = "TASK_DUE_DATE_CHANGED"
    TASK_STATUS_CHANGED = "TASK_STATUS_CHANGED"

