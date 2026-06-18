from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, update, func
from database import get_db
from models import Message, User, PushSubscription
from routers.auth import get_current_user, decode_token
from push_service import send_push
from pydantic import BaseModel
from typing import Dict, Optional
import json, shutil, os, uuid

router = APIRouter(prefix="/messages", tags=["messages"])

UPLOAD_DIR = "uploads/messages"
os.makedirs(UPLOAD_DIR, exist_ok=True)

IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}
AUDIO_EXTS = {"mp3", "wav", "ogg", "webm", "m4a", "aac", "opus", "mp4"}


class SendMessage(BaseModel):
    text: Optional[str] = None
    reply_to_id: Optional[int] = None


def serialize_msg(m: Message, current_user_id: int, reply_msg: Optional[Message] = None) -> dict:
    reply_to = None
    if reply_msg:
        reply_to = {
            "id": reply_msg.id,
            "text": reply_msg.text or "",
            "file_type": reply_msg.file_type,
            "file_name": reply_msg.file_name,
            "is_mine": reply_msg.from_id == current_user_id,
        }
    return {
        "type": "message",
        "id": m.id,
        "text": m.text or "",
        "file_url": m.file_url,
        "file_type": m.file_type,
        "file_name": m.file_name,
        "reply_to_id": m.reply_to_id,
        "reply_to": reply_to,
        "is_mine": m.from_id == current_user_id,
        "is_read": m.is_read,
        "created_at": m.created_at.isoformat(),
    }


async def fetch_reply_map(db: AsyncSession, messages: list) -> dict:
    ids = {m.reply_to_id for m in messages if m.reply_to_id}
    if not ids:
        return {}
    r = await db.execute(select(Message).where(Message.id.in_(ids)))
    return {rm.id: rm for rm in r.scalars().all()}


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
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                self.disconnect(user_id)


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
        if other_id in seen:
            continue
        seen.add(other_id)
        user_r = await db.execute(select(User).where(User.id == other_id))
        other = user_r.scalar_one_or_none()
        if not other:
            continue

        unread_r = await db.execute(
            select(func.count(Message.id)).where(
                Message.from_id == other_id,
                Message.to_id == current_user.id,
                Message.is_read == False,
            )
        )
        unread = unread_r.scalar() or 0

        if msg.file_type == "audio":
            preview = "🎤 Голосовое"
        elif msg.file_type == "image":
            preview = "🖼 Фото"
        elif msg.file_type == "file":
            preview = "📎 " + (msg.file_name or "Файл")
        else:
            preview = msg.text or ""

        conversations.append({
            "user": {
                "id": other.id,
                "username": other.username,
                "display_name": other.display_name,
                "avatar_url": other.avatar_url,
                "badge_verified": other.badge_verified,
            },
            "last_message": {
                "text": preview,
                "created_at": msg.created_at.isoformat(),
                "is_mine": msg.from_id == current_user.id,
                "is_read": msg.is_read,
            },
            "unread_count": unread,
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
        .where(or_(
            and_(Message.from_id == current_user.id, Message.to_id == user_id),
            and_(Message.from_id == user_id, Message.to_id == current_user.id),
        ))
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    reply_map = await fetch_reply_map(db, msgs)
    return [serialize_msg(m, current_user.id, reply_map.get(m.reply_to_id)) for m in msgs]


@router.post("/{user_id}/read")
async def mark_as_read(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Message)
        .where(
            Message.from_id == user_id,
            Message.to_id == current_user.id,
            Message.is_read == False,
        )
        .values(is_read=True)
    )
    await db.commit()
    await manager.send_to(user_id, {"type": "read", "by_user_id": current_user.id})
    return {"ok": True}


@router.post("/{user_id}")
async def send_message(
    user_id: int,
    data: SendMessage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    msg = Message(from_id=current_user.id, to_id=user_id, text=data.text, reply_to_id=data.reply_to_id)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    reply_msg = None
    if msg.reply_to_id:
        r = await db.execute(
            select(Message).where(
                Message.id == msg.reply_to_id,
                or_(
                    and_(Message.from_id == current_user.id, Message.to_id == user_id),
                    and_(Message.from_id == user_id, Message.to_id == current_user.id),
                ),
            )
        )
        reply_msg = r.scalar_one_or_none()

    await manager.send_to(user_id, {**serialize_msg(msg, user_id, reply_msg), "from_id": current_user.id})

    if not manager.active.get(user_id):
        subs_r = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
        subs = subs_r.scalars().all()
        if subs:
            name = current_user.display_name or current_user.username
            await send_push(subs, "Kofka", f"{name}: {data.text or '📎 Вложение'}")

    return serialize_msg(msg, current_user.id, reply_msg)


@router.post("/{user_id}/file")
async def send_file_message(
    user_id: int,
    file: UploadFile = File(...),
    reply_to_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    if ext in IMAGE_EXTS:
        file_type = "image"
    elif ext in AUDIO_EXTS or (file.content_type or "").startswith("audio/"):
        file_type = "audio"
    else:
        file_type = "file"

    display_name = "Голосовое сообщение" if file_type == "audio" else file.filename

    msg = Message(
        from_id=current_user.id, to_id=user_id,
        file_url=f"/uploads/messages/{filename}",
        file_type=file_type,
        file_name=display_name,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    reply_msg = None
    if msg.reply_to_id:
        r = await db.execute(
            select(Message).where(
                Message.id == msg.reply_to_id,
                or_(
                    and_(Message.from_id == current_user.id, Message.to_id == user_id),
                    and_(Message.from_id == user_id, Message.to_id == current_user.id),
                ),
            )
        )
        reply_msg = r.scalar_one_or_none()

    await manager.send_to(user_id, {**serialize_msg(msg, user_id, reply_msg), "from_id": current_user.id})

    if not manager.active.get(user_id):
        subs_r = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
        subs = subs_r.scalars().all()
        if subs:
            name = current_user.display_name or current_user.username
            body = "🎤 Голосовое" if file_type == "audio" else "🖼 Фото" if file_type == "image" else "📎 Файл"
            await send_push(subs, "Kofka", f"{name}: {body}")

    return serialize_msg(msg, current_user.id, reply_msg)


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
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") in ("call_offer", "call_answer", "call_ice", "call_end", "call_decline"):
                    target = msg.get("to_user_id")
                    if target:
                        await manager.send_to(int(target), {**msg, "from_user_id": user_id})
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(user_id)
