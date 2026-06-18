from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import models
from routers import auth, users, messages, calls, posts, push
from sqlalchemy import text
import os

app = FastAPI(title="Family Social Network")

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/posts", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url VARCHAR(500)"))
        await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)"))
        await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)"))
        await conn.execute(text("ALTER TABLE messages ALTER COLUMN text DROP NOT NULL"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL"))
        await conn.execute(text("ALTER TABLE posts ADD COLUMN IF NOT EXISTS title VARCHAR(200)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_verified BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL"))
        await conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_unique'
                ) THEN
                    ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);
                END IF;
            END $$
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS calls (
                id SERIAL PRIMARY KEY,
                caller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'missed',
                duration INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(messages.router)
app.include_router(calls.router)
app.include_router(posts.router)
app.include_router(push.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Family Social API is running"}
