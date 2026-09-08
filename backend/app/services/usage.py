"""Simple per-user, per-day usage tracking and rate limiting."""
from datetime import date
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from .. import models
from ..config import settings


def _get_or_create_today_log(db: Session, user_id: str) -> models.UsageLog:
    today = date.today()
    log = (
        db.query(models.UsageLog)
        .filter(models.UsageLog.user_id == user_id, models.UsageLog.day == today)
        .first()
    )
    if not log:
        log = models.UsageLog(user_id=user_id, day=today, uploads=0, queries=0)
        db.add(log)
        db.commit()
        db.refresh(log)
    return log


def check_and_increment_upload(db: Session, user_id: str):
    log = _get_or_create_today_log(db, user_id)
    if log.uploads >= settings.MAX_UPLOADS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily upload limit reached ({settings.MAX_UPLOADS_PER_DAY}/day).",
        )
    log.uploads += 1
    db.commit()


def check_and_increment_query(db: Session, user_id: str):
    log = _get_or_create_today_log(db, user_id)
    if log.queries >= settings.MAX_QUERIES_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily query limit reached ({settings.MAX_QUERIES_PER_DAY}/day).",
        )
    log.queries += 1
    db.commit()
