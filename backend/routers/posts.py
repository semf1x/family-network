from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Post, User
from routers.auth import get_current_user
from typing import Optional
import shutil, os, uuid

router = APIRouter(prefix="/posts", tags=["posts"])

UPLOAD_DIR = "uploads/posts"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def serialize_post(p: Post, author: User) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "text": p.text,
        "image_url": p.image_url,
        "created_at": p.created_at.isoformat(),
        "author": {
            "id": author.id,
            "username": author.username,
            "display_name": author.display_name,
            "avatar_url": author.avatar_url,
        },
    }


@router.get("/user/{user_id}")
async def get_user_posts(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Post).where(Post.user_id == user_id).order_by(Post.created_at.desc())
    )
    posts = result.scalars().all()
    author_r = await db.execute(select(User).where(User.id == user_id))
    author = author_r.scalar_one_or_none()
    if not author:
        return []
    return [serialize_post(p, author) for p in posts]


@router.post("/")
async def create_post(
    title: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not title and not text and not image:
        raise HTTPException(400, "Нужно заполнить хотя бы одно поле")

    image_url = None
    if image and image.filename:
        ext = image.filename.rsplit(".", 1)[-1].lower()
        filename = f"{uuid.uuid4()}.{ext}"
        path = os.path.join(UPLOAD_DIR, filename)
        with open(path, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_url = f"/uploads/posts/{filename}"

    post = Post(user_id=current_user.id, title=title, text=text, image_url=image_url)
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return serialize_post(post, current_user)


@router.delete("/{post_id}")
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Пост не найден")
    if post.user_id != current_user.id:
        raise HTTPException(403, "Нет прав")
    await db.delete(post)
    await db.commit()
    return {"ok": True}
