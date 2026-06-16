from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User
from schemas import UserRegister, UserLogin, Token, UserOut, VerifyEmailRequest, ResendCodeRequest
from auth import hash_password, verify_password, create_token, decode_token
from email_service import send_verification_code
from jose import JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import redis.asyncio as aioredis
import random
import os
import re

USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{3,19}$")

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


@router.post("/register")
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    if not USERNAME_RE.match(data.username):
        raise HTTPException(
            status_code=400,
            detail="Username: 4-20 символов, только строчные буквы, цифры и _, начинается с буквы"
        )

    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Этот username уже занят")

    user = User(
        username=data.username,
        display_name=data.display_name or None,
        email=data.email,
        password_hash=hash_password(data.password),
        is_verified=False,
    )
    db.add(user)
    await db.commit()

    code = str(random.randint(100000, 999999))
    await redis_client.setex(f"verify:{data.email}", VERIFY_TTL, code)
    await send_verification_code(data.email, code)

    return {"message": "Код подтверждения отправлен на почту", "email": data.email}


@router.post("/verify", response_model=Token)
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    stored = await redis_client.get(f"verify:{data.email}")
    if not stored or stored.decode() != data.code:
        raise HTTPException(status_code=400, detail="Неверный или устаревший код")

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.is_verified = True
    await db.commit()
    await db.refresh(user)
    await redis_client.delete(f"verify:{data.email}")

    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/resend-code")
async def resend_code(data: ResendCodeRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email уже подтверждён")

    code = str(random.randint(100000, 999999))
    await redis_client.setex(f"verify:{data.email}", VERIFY_TTL, code)
    await send_verification_code(data.email, code)

    return {"message": "Код отправлен повторно"}


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
