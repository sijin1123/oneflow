from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    """The authenticated user (dev user in dev mode). Lets the UI decide which
    per-project controls to show based on the caller's membership role."""
    return UserRead.model_validate(user)
