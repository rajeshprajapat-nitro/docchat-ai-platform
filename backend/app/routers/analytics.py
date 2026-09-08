from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models, auth
from ..database import get_db
from ..config import settings

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def summary(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    total_documents = (
        db.query(func.count(models.Document.id))
        .filter(models.Document.owner_id == current_user.id)
        .scalar()
    )
    total_chunks = (
        db.query(func.coalesce(func.sum(models.Document.num_chunks), 0))
        .filter(models.Document.owner_id == current_user.id)
        .scalar()
    )
    total_chats = (
        db.query(func.count(models.ChatSession.id))
        .filter(models.ChatSession.owner_id == current_user.id)
        .scalar()
    )
    total_messages = (
        db.query(func.count(models.ChatMessage.id))
        .join(models.ChatSession, models.ChatMessage.session_id == models.ChatSession.id)
        .filter(models.ChatSession.owner_id == current_user.id)
        .scalar()
    )

    today_log = (
        db.query(models.UsageLog)
        .filter(models.UsageLog.user_id == current_user.id, models.UsageLog.day == date.today())
        .first()
    )
    uploads_today = today_log.uploads if today_log else 0
    queries_today = today_log.queries if today_log else 0

    return {
        "total_documents": total_documents or 0,
        "total_chunks": total_chunks or 0,
        "total_chats": total_chats or 0,
        "total_messages": total_messages or 0,
        "uploads_today": uploads_today,
        "queries_today": queries_today,
        "max_uploads_per_day": settings.MAX_UPLOADS_PER_DAY,
        "max_queries_per_day": settings.MAX_QUERIES_PER_DAY,
    }
