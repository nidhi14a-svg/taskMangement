from datetime import datetime, timezone
from typing import Any, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.core.database import get_database
from app.models.task import TASKS_COLLECTION
from app.models.user import USERS_COLLECTION
from app.models.enums import UserRole, TaskStatus, TaskPriority
from app.schemas.dashboard import DashboardSummaryResponse
from app.schemas.user import UserResponse
from app.api.dependencies import get_current_user

router = APIRouter()


@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Dashboard Summary Analytics",
    description="Calculates summary metrics: totals, pending, completed, overdue, status & priority breakdowns, and completion rate.",
)
async def get_dashboard_summary(
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> DashboardSummaryResponse:
    """
    Computes dashboard analytics:
    - ADMIN role: Global organization-wide metrics + total employees.
    - TEAM_LEAD role: Department team metrics + total team members.
    - EMPLOYEE/USER role: Scoped metrics for tasks created by or assigned to user.
    """
    now_utc = datetime.now(timezone.utc)

    # Define scope filter and employee/team counters
    base_match: dict[str, Any] = {}
    total_employees: Optional[int] = None
    total_team_members: Optional[int] = None

    if current_user.role == UserRole.ADMIN:
        base_match = {}
        total_employees = await db[USERS_COLLECTION].count_documents({})
    elif current_user.role == UserRole.TEAM_LEAD:
        lead_dept = (current_user.department or "").strip()
        if lead_dept:
            team_cursor = db[USERS_COLLECTION].find({"department": lead_dept}, {"_id": 1})
            team_docs = await team_cursor.to_list(length=1000)
            team_ids = [d["_id"] for d in team_docs] + [ObjectId(current_user.id)]
            base_match = {
                "$or": [
                    {"creator_id": {"$in": team_ids}},
                    {"assignee_id": {"$in": team_ids}},
                ]
            }
            total_team_members = len(team_docs)
        else:
            user_oid = ObjectId(current_user.id)
            base_match = {"$or": [{"creator_id": user_oid}, {"assignee_id": user_oid}]}
            total_team_members = 1
    else:
        user_oid = ObjectId(current_user.id)
        base_match = {
            "$or": [
                {"creator_id": user_oid},
                {"assignee_id": user_oid},
            ]
        }

    # MongoDB aggregation pipeline with $facet
    pipeline = [
        {"$match": base_match},
        {
            "$facet": {
                "counts": [
                    {
                        "$group": {
                            "_id": None,
                            "total": {"$sum": 1},
                            "completed": {
                                "$sum": {
                                    "$cond": [
                                        {"$eq": ["$status", TaskStatus.COMPLETED.value]},
                                        1,
                                        0,
                                    ]
                                }
                            },
                            "pending": {
                                "$sum": {
                                    "$cond": [
                                        {
                                            "$in": [
                                                "$status",
                                                [
                                                    TaskStatus.TODO.value,
                                                    TaskStatus.IN_PROGRESS.value,
                                                ],
                                            ]
                                        },
                                        1,
                                        0,
                                    ]
                                }
                            },
                            "overdue": {
                                "$sum": {
                                    "$cond": [
                                        {
                                            "$and": [
                                                {"$ne": ["$status", TaskStatus.COMPLETED.value]},
                                                {"$ne": ["$due_date", None]},
                                                {"$lt": ["$due_date", now_utc]},
                                            ]
                                        },
                                        1,
                                        0,
                                    ]
                                }
                            },
                        }
                    }
                ],
                "status_counts": [
                    {"$group": {"_id": "$status", "count": {"$sum": 1}}}
                ],
                "priority_counts": [
                    {"$group": {"_id": "$priority", "count": {"$sum": 1}}}
                ],
            }
        },
    ]

    cursor = await db[TASKS_COLLECTION].aggregate(pipeline)
    facet_results = await cursor.to_list(length=1)

    # Initialize full default dictionaries
    status_breakdown = {status.value: 0 for status in TaskStatus}
    priority_breakdown = {priority.value: 0 for priority in TaskPriority}

    total_tasks = 0
    completed_tasks = 0
    pending_tasks = 0
    overdue_tasks = 0

    if facet_results:
        res = facet_results[0]

        # Extract counts
        counts_list = res.get("counts", [])
        if counts_list:
            c = counts_list[0]
            total_tasks = c.get("total", 0)
            completed_tasks = c.get("completed", 0)
            pending_tasks = c.get("pending", 0)
            overdue_tasks = c.get("overdue", 0)

        # Extract status breakdown
        for item in res.get("status_counts", []):
            st_key = item.get("_id")
            if st_key in status_breakdown:
                status_breakdown[st_key] = item.get("count", 0)

        # Extract priority breakdown
        for item in res.get("priority_counts", []):
            pr_key = item.get("_id")
            if pr_key in priority_breakdown:
                priority_breakdown[pr_key] = item.get("count", 0)

    completion_rate = (
        round((completed_tasks / total_tasks) * 100.0, 2)
        if total_tasks > 0
        else 0.0
    )

    return DashboardSummaryResponse(
        total_tasks=total_tasks,
        pending_tasks=pending_tasks,
        completed_tasks=completed_tasks,
        overdue_tasks=overdue_tasks,
        status_breakdown=status_breakdown,
        priority_breakdown=priority_breakdown,
        completion_rate=completion_rate,
        total_employees=total_employees,
        total_team_members=total_team_members,
        department=current_user.department,
    )
