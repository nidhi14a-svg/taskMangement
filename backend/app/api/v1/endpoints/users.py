from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase
from app.core.database import get_database
from app.models.user import USERS_COLLECTION
from app.schemas.user import UserResponse
from app.api.dependencies import get_current_user

router = APIRouter()


@router.get(
    "",
    response_model=list[UserResponse],
    summary="List Users Directory",
    description="Returns a directory of registered users for assignment selection. Excludes sensitive fields.",
)
@router.get("/", response_model=list[UserResponse], include_in_schema=False)
async def list_users_directory(
    db: AsyncDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
) -> list[UserResponse]:
    """
    Retrieves a list of users for task assignment.
    Requires a valid authentication token.
    Never exposes passwords or internal credentials.
    """
    cursor = db[USERS_COLLECTION].find({}, {"password_hash": 0}).sort("name", 1)
    user_docs = await cursor.to_list(length=1000)
    return [UserResponse.model_validate(doc) for doc in user_docs]
