from enum import Enum


class UserRole(str, Enum):
    """User authorization roles."""
    USER = "USER"
    ADMIN = "ADMIN"


class TaskStatus(str, Enum):
    """Task workflow states."""
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class TaskPriority(str, Enum):
    """Task urgency levels."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
