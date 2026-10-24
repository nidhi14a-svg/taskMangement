import math
import re
from datetime import datetime, timezone
from typing import Optional, Any
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status, BackgroundTasks
from pymongo.asynchronous.database import AsyncDatabase

from app.core.database import get_database
from app.models.task import TASKS_COLLECTION
from app.models.user import USERS_COLLECTION
from app.models.enums import UserRole, TaskStatus, TaskPriority
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskPaginationResponse,
)
from app.schemas.user import UserResponse
from app.api.dependencies import get_current_user
from app.services.notification_service import NotificationService

router = APIRouter()

ALLOWED_SORT_FIELDS = {"due_date", "created_at", "updated_at", "title", "priority", "status"}


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Task",
    description="Creates a new task. Sets creator_id to authenticated user. Validates assignee existence if specified.",
)
@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> TaskResponse:
    """
    Creates a new task document:
    - Sets creator_id exclusively from authenticated user token.
    - Validates that assignee_id exists in the users collection if provided.
    - Assigns UTC timestamps.
    - Triggers in-app notification and email alert to the assignee.
    """
    assignee_oid: Optional[ObjectId] = None
    assignee_doc: Optional[dict[str, Any]] = None
    if payload.assignee_id is not None:
        assignee_oid = ObjectId(payload.assignee_id)
        assignee_doc = await db[USERS_COLLECTION].find_one({"_id": assignee_oid})
        if not assignee_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Assignee user with ID '{payload.assignee_id}' does not exist.",
            )

        # TEAM_LEAD can only assign tasks within their department/team
        if current_user.role == UserRole.TEAM_LEAD:
            lead_dept = (current_user.department or "").strip().lower()
            assignee_dept = (assignee_doc.get("department") or "").strip().lower()
            is_self = str(assignee_doc["_id"]) == str(current_user.id)
            if not is_self and (not lead_dept or lead_dept != assignee_dept):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Team leads can only assign tasks to members of their department/team.",
                )

    now = datetime.now(timezone.utc)
    new_task_id = ObjectId()
    task_doc = {
        "_id": new_task_id,
        "title": payload.title,
        "description": payload.description,
        "status": payload.status.value,
        "priority": payload.priority.value,
        "due_date": payload.due_date,
        "creator_id": ObjectId(current_user.id),
        "assignee_id": assignee_oid,
        "created_at": now,
        "updated_at": now,
    }

    await db[TASKS_COLLECTION].insert_one(task_doc)

    # Trigger notification and email alert if an employee was assigned
    if assignee_doc:
        try:
            await NotificationService.notify_task_assignment(
                db=db,
                task_doc=task_doc,
                assigner=current_user,
                assignee_doc=assignee_doc,
                background_tasks=background_tasks,
            )
        except Exception as e:
            # Task must be preserved even if notification/email encounters an issue
            pass

    return TaskResponse.model_validate(task_doc)


@router.get(
    "",
    response_model=TaskPaginationResponse,
    summary="List Tasks",
    description="Lists tasks authorized for the current user with search, filtering, sorting, and pagination.",
)
@router.get("/", response_model=TaskPaginationResponse, include_in_schema=False)
async def list_tasks(
    search: Optional[str] = Query(None, description="Case-insensitive title search"),
    status_filter: Optional[TaskStatus] = Query(None, alias="status", description="Filter by status (TODO, IN_PROGRESS, COMPLETED)"),
    priority_filter: Optional[TaskPriority] = Query(None, alias="priority", description="Filter by priority (LOW, MEDIUM, HIGH, URGENT)"),
    filter_type: Optional[str] = Query(None, alias="filter", description="Filter by relationship ('created' or 'assigned')"),
    sort_by: Optional[str] = Query("created_at", description="Field to sort by (e.g. due_date, created_at, title)"),
    sort_order: Optional[str] = Query("desc", description="Sort direction ('asc' or 'desc')"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> TaskPaginationResponse:
    """
    Lists tasks with authorization and MongoDB querying:
    - ADMIN can view all tasks in the system.
    - TEAM_LEAD views tasks within their authorized department team.
    - EMPLOYEE/USER can only view tasks they created or are assigned to.
    - Supports filtering by 'created' (created by current user) or 'assigned' (assigned to current user).
    - Filters by search regex, status, and priority.
    - Stable sorting with secondary tie-breaker on _id.
    - Returns pagination metadata.
    """
    query: dict[str, Any] = {}

    # Authorization and relationship scoping
    user_oid = ObjectId(current_user.id)
    if filter_type == "assigned":
        query["assignee_id"] = user_oid
    elif filter_type == "created":
        query["creator_id"] = user_oid
    elif current_user.role == UserRole.ADMIN:
        # Admin can view all tasks in the system
        pass
    elif current_user.role == UserRole.TEAM_LEAD:
        # Team lead sees all tasks created by or assigned to members of their department
        lead_dept = (current_user.department or "").strip()
        if lead_dept:
            team_cursor = db[USERS_COLLECTION].find({"department": lead_dept}, {"_id": 1})
            team_docs = await team_cursor.to_list(length=1000)
            team_ids = [d["_id"] for d in team_docs] + [user_oid]
            query["$or"] = [
                {"creator_id": {"$in": team_ids}},
                {"assignee_id": {"$in": team_ids}},
            ]
        else:
            query["$or"] = [
                {"creator_id": user_oid},
                {"assignee_id": user_oid},
            ]
    else:
        query["$or"] = [
            {"creator_id": user_oid},
            {"assignee_id": user_oid},
        ]

    # Status filter
    if status_filter is not None:
        query["status"] = status_filter.value

    # Priority filter
    if priority_filter is not None:
        query["priority"] = priority_filter.value

    # Case-insensitive title search (escaped to prevent regex injection)
    if search:
        trimmed = search.strip()
        if trimmed:
            query["title"] = {"$regex": re.escape(trimmed), "$options": "i"}

    # Sorting
    sort_field = sort_by if sort_by in ALLOWED_SORT_FIELDS else "created_at"
    direction = 1 if (sort_order or "").lower() == "asc" else -1
    sort_criteria = [(sort_field, direction), ("_id", 1)]

    total = await db[TASKS_COLLECTION].count_documents(query)
    skip = (page - 1) * page_size
    cursor = db[TASKS_COLLECTION].find(query).sort(sort_criteria).skip(skip).limit(page_size)
    task_docs = await cursor.to_list(length=page_size)

    total_pages = math.ceil(total / page_size) if total > 0 else 0
    items = [TaskResponse.model_validate(doc) for doc in task_docs]

    return TaskPaginationResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def is_team_member(db: AsyncDatabase, member_oid: Optional[ObjectId], lead_dept: Optional[str]) -> bool:
    if not member_oid or not lead_dept:
        return False
    user_doc = await db[USERS_COLLECTION].find_one({"_id": member_oid})
    if not user_doc:
        return False
    return (user_doc.get("department") or "").strip().lower() == lead_dept.strip().lower()


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get Task by ID",
    description="Retrieves a single task document by its ID if authorized.",
)
async def get_task_by_id(
    task_id: str,
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> TaskResponse:
    """
    Retrieves task details:
    - Validates ObjectId format.
    - Verifies user is ADMIN, creator, assignee, or TEAM_LEAD of the task's department.
    """
    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid task ID format: '{task_id}'. Must be a 24-character hexadecimal ObjectId.",
        )

    task_doc = await db[TASKS_COLLECTION].find_one({"_id": ObjectId(task_id)})
    if not task_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found.",
        )

    # Authorization
    is_admin = current_user.role == UserRole.ADMIN
    is_creator = str(task_doc["creator_id"]) == str(current_user.id)
    is_assignee = task_doc.get("assignee_id") is not None and str(task_doc["assignee_id"]) == str(current_user.id)
    is_lead = (
        current_user.role == UserRole.TEAM_LEAD
        and (
            await is_team_member(db, task_doc.get("creator_id"), current_user.department)
            or await is_team_member(db, task_doc.get("assignee_id"), current_user.department)
        )
    )

    if not (is_admin or is_creator or is_assignee or is_lead):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this task.",
        )

    return TaskResponse.model_validate(task_doc)


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Update Task",
    description="Updates permitted fields of a task with role and ownership checks.",
)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> TaskResponse:
    """
    Updates task fields:
    - ADMIN can modify all permitted fields.
    - CREATOR can modify all permitted fields.
    - ASSIGNEE can ONLY update status.
    - Assignee existence is verified upon assignment/reassignment.
    - Protected ownership fields (creator_id, _id) cannot be modified.
    """
    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid task ID format: '{task_id}'. Must be a 24-character hexadecimal ObjectId.",
        )

    task_doc = await db[TASKS_COLLECTION].find_one({"_id": ObjectId(task_id)})
    if not task_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found.",
        )

    is_admin = current_user.role == UserRole.ADMIN
    is_creator = str(task_doc["creator_id"]) == str(current_user.id)
    is_assignee = task_doc.get("assignee_id") is not None and str(task_doc["assignee_id"]) == str(current_user.id)
    is_lead = (
        current_user.role == UserRole.TEAM_LEAD
        and (
            await is_team_member(db, task_doc.get("creator_id"), current_user.department)
            or await is_team_member(db, task_doc.get("assignee_id"), current_user.department)
        )
    )

    # Access control
    if not (is_admin or is_creator or is_assignee or is_lead):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this task.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return TaskResponse.model_validate(task_doc)

    # Restrict assignee updates to status only (unless user is also creator, team lead, or admin)
    if is_assignee and not is_creator and not is_admin and not is_lead:
        disallowed_fields = set(update_data.keys()) - {"status"}
        if disallowed_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Assigned users are only permitted to update the task status.",
            )

    # Validate assignee if assignment is changing
    if "assignee_id" in update_data:
        new_assignee_id = update_data["assignee_id"]
        if new_assignee_id is not None:
            assignee_user = await db[USERS_COLLECTION].find_one({"_id": ObjectId(new_assignee_id)})
            if not assignee_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Assignee user with ID '{new_assignee_id}' does not exist.",
                )

            # TEAM_LEAD can only reassign to members of their department
            if current_user.role == UserRole.TEAM_LEAD:
                lead_dept = (current_user.department or "").strip().lower()
                assignee_dept = (assignee_user.get("department") or "").strip().lower()
                is_self = str(assignee_user["_id"]) == str(current_user.id)
                if not is_self and (not lead_dept or lead_dept != assignee_dept):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Team leads can only assign tasks to members of their department/team.",
                    )

    # Build $set update dictionary
    set_fields: dict[str, Any] = {}
    for k, v in update_data.items():
        if k in ("status", "priority") and hasattr(v, "value"):
            set_fields[k] = v.value
        elif k == "assignee_id":
            set_fields[k] = ObjectId(v) if v is not None else None
        else:
            set_fields[k] = v

    set_fields["updated_at"] = datetime.now(timezone.utc)

    await db[TASKS_COLLECTION].update_one(
        {"_id": task_doc["_id"]},
        {"$set": set_fields},
    )

    updated_task = await db[TASKS_COLLECTION].find_one({"_id": task_doc["_id"]})

    # Trigger notifications if assignment, priority, or due date changed
    if updated_task:
        try:
            await NotificationService.notify_task_updates(
                db=db,
                old_task=task_doc,
                updated_task=updated_task,
                modifier=current_user,
                background_tasks=background_tasks,
            )
        except Exception:
            # Preserves task update even if notification/email encounters an issue
            pass

    return TaskResponse.model_validate(updated_task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Task",
    description="Deletes a task. Permitted for task creator and administrators.",
)
async def delete_task(
    task_id: str,
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> Response:
    """
    Deletes task document:
    - Permitted for task creator and ADMIN role.
    - Rejects unauthorized users with HTTP 403.
    """
    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid task ID format: '{task_id}'. Must be a 24-character hexadecimal ObjectId.",
        )

    task_doc = await db[TASKS_COLLECTION].find_one({"_id": ObjectId(task_id)})
    if not task_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found.",
        )

    is_admin = current_user.role == UserRole.ADMIN
    is_creator = str(task_doc["creator_id"]) == str(current_user.id)
    is_lead_creator = (
        current_user.role == UserRole.TEAM_LEAD
        and await is_team_member(db, task_doc.get("creator_id"), current_user.department)
    )

    if not (is_admin or is_creator or is_lead_creator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this task. Only the creator, team lead, or an administrator can delete tasks.",
        )

    await db[TASKS_COLLECTION].delete_one({"_id": task_doc["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
