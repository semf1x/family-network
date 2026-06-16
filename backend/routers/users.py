from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models import User
from schemas import UserOut, UserPublicOut
from routers.auth import get_current_user, redis_client
from auth import verify_password, hash_password
from sms_service import send_sms_code
from pydantic import BaseModel
from typing import Optional, List
import shutil, os, uuid, re, random

router = APIRouter(prefix="/users", tags=["users"])

UPLOAD_DIR = "uploads/avatars"
os.makedirs(UPLOAD_DIR, exist_ok=True)

USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{3,19}$")


class UpdateProfile(BaseModel):
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None

class SetPhone(BaseModel):
    phone: str

class VerifyPhone(BaseModel):
    code: str

class PrivacySettings(BaseModel):
    show_phone: Optional[bool] = None

class ChangePassword(BaseModel):
    old_password: str
    new_password: str


@router.get("/me", response_model=UserOut)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/check-username")
async def check_username(
    username: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not USERNAME_RE.match(username):
        return {"available": False, "error": "4-20 символов, строчные буквы, цифры и _"}
    result = await db.execute(
        select(User).where(User.username == username, User.id != current_user.id)
    )
    taken = result.scalar_one_or_none()
    return {"available": not taken}


@router.patch("/me", response_model=UserOut)
async def update_profile(
    data: UpdateProfile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.username is not None:
        if not USERNAME_RE.match(data.username):
            raise HTTPException(
                status_code=400,
                detail="Username: 4-20 символов, строчные буквы, цифры и _, начинается с буквы"
            )
        result = await db.execute(
            select(User).where(User.username == data.username, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Этот username уже занят")
        current_user.username = data.username

    if data.display_name is not None:
        current_user.display_name = data.display_name.strip() or None

    if data.bio is not None:
        current_user.bio = data.bio

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(status_code=400, detail="Only jpg, png, webp allowed")

    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    current_user.avatar_url = f"/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/password")
async def change_password(
    data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Новый пароль должен быть не менее 6 символов")
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"message": "Пароль изменён"}


@router.post("/me/phone")
async def request_phone_verify(
    data: SetPhone,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    phone = data.phone.strip()
    if not re.match(r"^\+?[0-9\s\-\(\)]{7,20}$", phone):
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")

    # Проверяем, не занят ли номер другим пользователем
    result = await db.execute(
        select(User).where(User.phone == phone, User.id != current_user.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Этот номер уже используется")

    current_user.phone = phone
    current_user.phone_verified = False
    await db.commit()

    code = str(random.randint(100000, 999999))
    await redis_client.setex(f"phone_verify:{current_user.id}", 600, code)
    await send_sms_code(phone, code)

    return {"message": "Код отправлен на номер", "phone": phone}


@router.post("/me/phone/verify", response_model=UserOut)
async def verify_phone(
    data: VerifyPhone,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stored = await redis_client.get(f"phone_verify:{current_user.id}")
    if not stored or stored.decode() != data.code:
        raise HTTPException(status_code=400, detail="Неверный или устаревший код")

    current_user.phone_verified = True
    await db.commit()
    await db.refresh(current_user)
    await redis_client.delete(f"phone_verify:{current_user.id}")
    return current_user


@router.patch("/me/privacy", response_model=UserOut)
async def update_privacy(
    data: PrivacySettings,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.show_phone is not None:
        current_user.show_phone = data.show_phone
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/profile/{username}", response_model=UserPublicOut)
async def get_public_profile(
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Скрываем телефон если приватность запрещает
    public = UserPublicOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        phone=user.phone if (user.show_phone and user.phone_verified) else None,
        phone_verified=user.phone_verified,
        is_verified=user.is_verified,
        created_at=user.created_at,
    )
    return public


@router.get("/search", response_model=List[UserOut])
async def search_users(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(
            User.id != current_user.id,
            or_(
                User.username.ilike(f"%{q}%"),
                User.display_name.ilike(f"%{q}%"),
            )
        )
        .limit(20)
    )
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
