import os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from database import get_db
from models import PushSubscription, User
from routers.auth import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/push", tags=["push"])


class SubscribeData(BaseModel):
    endpoint: str
    keys: dict


@router.get("/vapid-public-key")
async def vapid_public_key():
    return {"public_key": os.getenv("VAPID_PUBLIC_KEY", "")}


@router.post("/subscribe")
async def subscribe(
    data: SubscribeData,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    sub = PushSubscription(
        user_id=current_user.id,
        endpoint=data.endpoint,
        p256dh=data.keys.get("p256dh", ""),
        auth=data.keys.get("auth", ""),
    )
    db.add(sub)
    await db.commit()
    return {"ok": True}


@router.delete("/unsubscribe")
async def unsubscribe(
    data: SubscribeData,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == data.endpoint,
        )
    )
    await db.commit()
    return {"ok": True}
