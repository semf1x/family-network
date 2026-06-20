from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User
from schemas import UserRegister, UserLogin, Token, UserOut, PhoneVerifyRequest, ResendCodeRequest
from auth import hash_password, verify_password, create_token, decode_token
from sms_service import send_sms_code
from jose import JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import redis.asyncio as aioredis
import secrets
import os
import re

USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{3,19}$")
PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")


def normalize_phone(raw: str) -> str:
    """Normalize to +7XXXXXXXXXX for Russian numbers."""
    digits = re.sub(r"\D", "", raw.strip())
    # 8-XXX-XXX-XX-XX → 7XXXXXXXXXX
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    # 10 digits with no country code → assume +7
    if len(digits) == 10:
        digits = "7" + digits
    return "+" + digits

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer()

redis_client = aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))

VERIFY_TTL = 600  # 10 минут


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/check-username")
async def check_username_public(username: str, db: AsyncSession = Depends(get_db)):
    if not USERNAME_RE.match(username):
        return {"available": False, "error": "4-20 символов, строчные буквы, цифры и _"}
    result = await db.execute(select(User).where(User.username == username))
    taken = result.scalar_one_or_none()
    return {"available": not taken}


@router.post("/register")
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    if not USERNAME_RE.match(data.username):
        raise HTTPException(
            status_code=400,
            detail="Username: 4-20 символов, только строчные буквы, цифры и _, начинается с буквы"
        )

    phone = normalize_phone(data.phone)
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")

    if len(data.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Пароль не должен превышать 72 символа")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Пароль не менее 6 символов")

    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Этот username уже занят")

    result = await db.execute(select(User).where(User.phone == phone))
    existing = result.scalar_one_or_none()
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=400, detail="Этот номер уже зарегистрирован")
        # Unverified registration with same phone — resend code
        code = str(secrets.randbelow(900000) + 100000)
        await redis_client.setex(f"phone_auth:{phone}", VERIFY_TTL, code)
        await send_sms_code(phone, code)
        return {"message": "Код отправлен повторно", "phone": phone}

    user = User(
        username=data.username,
        display_name=data.display_name or None,
        phone=phone,
        phone_verified=False,
        password_hash=hash_password(data.password),
        is_verified=False,
    )
    db.add(user)
    await db.commit()

    code = str(secrets.randbelow(900000) + 100000)
    await redis_client.setex(f"phone_auth:{phone}", VERIFY_TTL, code)
    await send_sms_code(phone, code)

    return {"message": "Код отправлен на номер", "phone": phone}


@router.post("/verify", response_model=Token)
async def verify_phone(data: PhoneVerifyRequest, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(data.phone)
    stored = await redis_client.get(f"phone_auth:{phone}")
    if not stored or stored.decode() != data.code:
        raise HTTPException(status_code=400, detail="Неверный или устаревший код")

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.is_verified = True
    user.phone_verified = True
    await db.commit()
    await db.refresh(user)
    await redis_client.delete(f"phone_auth:{phone}")

    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/resend-code")
async def resend_code(data: ResendCodeRequest, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(data.phone)
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Номер уже подтверждён")

    code = str(secrets.randbelow(900000) + 100000)
    await redis_client.setex(f"phone_auth:{phone}", VERIFY_TTL, code)
    await send_sms_code(phone, code)

    return {"message": "Код отправлен повторно"}


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(data.phone)
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный номер или пароль")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Номер телефона не подтверждён. Завершите регистрацию.")

    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
