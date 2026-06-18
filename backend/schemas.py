from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class UserRegister(BaseModel):
    username: str
    display_name: Optional[str] = None
    phone: str
    password: str


class UserLogin(BaseModel):
    phone: str
    password: str


class PhoneVerifyRequest(BaseModel):
    phone: str
    code: str


class ResendCodeRequest(BaseModel):
    phone: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: Optional[str]
    email: Optional[str]
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
