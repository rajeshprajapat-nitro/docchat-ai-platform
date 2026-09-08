from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import Base, engine
from .config import settings
from .routers import auth as auth_router
from .routers import documents as documents_router
from .routers import chat as chat_router
from .routers import analytics as analytics_router

Base.metadata.create_all(bind=engine)


def _run_lightweight_migrations():
    """Adds any new columns to existing SQLite tables. Since this project
    doesn't use Alembic, this keeps `docker compose up --build` working after
    a schema change without requiring the user to delete their database."""
    inspector = inspect(engine)
    if "documents" not in inspector.get_table_names():
        return
    existing_columns = {col["name"] for col in inspector.get_columns("documents")}
    with engine.begin() as conn:
        if "summary" not in existing_columns:
            conn.execute(text("ALTER TABLE documents ADD COLUMN summary TEXT"))
        if "key_topics" not in existing_columns:
            conn.execute(text("ALTER TABLE documents ADD COLUMN key_topics TEXT"))
        if "suggested_questions" not in existing_columns:
            conn.execute(text("ALTER TABLE documents ADD COLUMN suggested_questions TEXT"))

    if "chat_sessions" in inspector.get_table_names():
        session_columns = {col["name"] for col in inspector.get_columns("chat_sessions")}
        with engine.begin() as conn:
            if "share_token" not in session_columns:
                conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN share_token TEXT"))


_run_lightweight_migrations()

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],
)

app.include_router(auth_router.router)
app.include_router(documents_router.router)
app.include_router(chat_router.router)
app.include_router(analytics_router.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
