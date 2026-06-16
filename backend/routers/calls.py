from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models import Call, User
from routers.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/calls", tags=["calls"])


class LogCall(BaseModel):
    receiver_id: int
    status: str          # completed | declined | missed
    duration: Optional[int] = 0


def serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
    }


@router.get("/")
async def get_call_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Call)
        .where(or_(Call.caller_id == current_user.id, Call.receiver_id == current_user.id))
        .order_by(Call.created_at.desc())
        .limit(100)
    )
    calls = result.scalars().all()

    out = []
    for c in calls:
        caller_r = await db.execute(select(User).where(User.id == c.caller_id))
        receiver_r = await db.execute(select(User).where(User.id == c.receiver_id))
        caller = caller_r.scalar_one_or_none()
        receiver = receiver_r.scalar_one_or_none()
        out.append({
            "id": c.id,
            "caller_id": c.caller_id,
            "receiver_id": c.receiver_id,
            "caller": serialize_user(caller) if caller else None,
            "receiver": serialize_user(receiver) if receiver else None,
            "status": c.status,
            "duration": c.duration,
            "created_at": c.created_at.isoformat(),
        })
    return out


@router.post("/")
async def log_call(
    data: LogCall,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    call = Call(
        caller_id=current_user.id,
        receiver_id=data.receiver_id,
        status=data.status,
        duration=data.duration or 0,
    )
    db.add(call)
    await db.commit()
    await db.refresh(call)
    return {"id": call.id}
