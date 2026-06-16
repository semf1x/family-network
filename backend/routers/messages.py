from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from database import get_db, SessionLocal
from models import Message, User
from routers.auth import get_current_user, decode_token
from pydantic import BaseModel
from typing import Dict
import json, shutil, os, uuid

router = APIRouter(prefix="/messages", tags=["messages"])

UPLOAD_DIR = "uploads/messages"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class SendMessage(BaseModel):
    text: str


def serialize_msg(m: Message, current_user_id: int) -> dict:
    return {
        "id": m.id,
        "text": m.text or "",
        "file_url": m.file_url,
        "file_type": m.file_type,
        "file_name": m.file_name,
        "is_mine": m.from_id == current_user_id,
        "created_at": m.created_at.isoformat(),
    }


class ConnectionManager:
    def __init__(self):
        self.active: Dict[int, WebSocket] = {}

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: int):
        self.active.pop(user_id, None)

    async def send_to(self, user_id: int, data: dict):
        ws = self.active.get(user_id)
        if ws:
            await ws.send_text(json.dumps(data))


manager = ConnectionManager()


@router.get("/conversations")
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(or_(Message.from_id == current_user.id, Message.to_id == current_user.id))
        .order_by(Message.created_at.desc())
    )
    messages = result.scalars().all()

    seen = set()
    conversations = []
    for msg in messages:
        other_id = msg.to_id if msg.from_id == current_user.id else msg.from_id
        if other_id not in seen:
            seen.add(other_id)
            user_result = await db.execute(select(User).where(User.id == other_id))
            other_user = user_result.scalar_one_or_none()
            if other_user:
                preview = msg.text or ("📎 " + (msg.file_name or "Файл"))
                conversations.append({
                    "user": {
                        "id": other_user.id,
                        "username": other_user.username,
                        "avatar_url": other_user.avatar_url,
                    },
                    "last_message": {
                        "text": preview,
                        "created_at": msg.created_at.isoformat(),
                        "is_mine": msg.from_id == current_user.id,
                    },
                })
    return conversations


@router.get("/{user_id}")
async def get_messages(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(
            or_(
                and_(Message.from_id == current_user.id, Message.to_id == user_id),
                and_(Message.from_id == user_id, Message.to_id == current_user.id),
            )
        )
        .order_by(Message.created_at.asc())
    )
    return [serialize_msg(m, current_user.id) for m in result.scalars().all()]


@router.post("/{user_id}")
async def send_message(
    user_id: int,
    data: SendMessage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    msg = Message(from_id=current_user.id, to_id=user_id, text=data.text)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    payload = {**serialize_msg(msg, user_id), "from_id": current_user.id}
    await manager.send_to(user_id, payload)

    return serialize_msg(msg, current_user.id)


@router.post("/{user_id}/file")
async def send_file_message(
    user_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_type = "image" if ext in ("jpg", "jpeg", "png", "webp", "gif") else "file"
    file_url = f"/uploads/messages/{filename}"

    msg = Message(
        from_id=current_user.id,
        to_id=user_id,
        text=None,
        file_url=file_url,
        file_type=file_type,
        file_name=file.filename,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    payload = {**serialize_msg(msg, user_id), "from_id": current_user.id}
    await manager.send_to(user_id, payload)

    return serialize_msg(msg, current_user.id)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str):
    try:
        user_id = decode_token(token)
    except Exception:
        await ws.close(code=1008)
        return

    await manager.connect(user_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id)
