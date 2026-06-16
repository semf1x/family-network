from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
import models
from routers import auth, users, messages
from sqlalchemy import text
import os

app = FastAPI(title="Family Social Network")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads/avatars", exist_ok=True)
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


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(messages.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Family Social API is running"}
