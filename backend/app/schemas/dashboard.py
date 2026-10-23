from pydantic import BaseModel, Field


class DashboardSummaryResponse(BaseModel):
    """
    Analytics summary metrics for dashboard visualization.
    Calculated across tasks within the user's authorization scope.
    """

    total_tasks: int = Field(
        default=0,
        description="Total number of unique tasks within scope",
    )
    pending_tasks: int = Field(
        default=0,
        description="Number of pending tasks (status TODO or IN_PROGRESS)",
    )
    completed_tasks: int = Field(
        default=0,
        description="Number of completed tasks (status COMPLETED)",
    )
    overdue_tasks: int = Field(
        default=0,
        description="Number of non-completed tasks whose due_date is earlier than current UTC time",
    )
    status_breakdown: dict[str, int] = Field(
        default_factory=lambda: {"TODO": 0, "IN_PROGRESS": 0, "COMPLETED": 0},
        description="Count of tasks partitioned by status",
    )
    priority_breakdown: dict[str, int] = Field(
        default_factory=lambda: {"LOW": 0, "MEDIUM": 0, "HIGH": 0},
        description="Count of tasks partitioned by priority",
    )
    completion_rate: float = Field(
        default=0.0,
        description="Percentage of tasks completed: (completed_tasks / total_tasks) * 100",
    )
