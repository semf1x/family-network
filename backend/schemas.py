from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class UserRegister(BaseModel):
    username: str
    display_name: Optional[str] = None
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ResendCodeRequest(BaseModel):
    email: EmailStr


class UserOut(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    email: str
    avatar_url: Optional[str]
    bio: Optional[str]
    phone: Optional[str]
    phone_verified: bool
    show_phone: bool
    is_verified: bool
    badge_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserPublicOut(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    avatar_url: Optional[str]
    bio: Optional[str]
    phone: Optional[str]   # None если show_phone=False
    phone_verified: bool
    is_verified: bool
    badge_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
