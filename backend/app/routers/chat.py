import json
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db, SessionLocal
from ..services import rag_engine, usage

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/sessions", response_model=List[schemas.ChatSessionOut])
def list_sessions(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return (
        db.query(models.ChatSession)
        .filter(models.ChatSession.owner_id == current_user.id)
        .order_by(models.ChatSession.created_at.desc())
        .all()
    )


@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.owner_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "citations": json.loads(m.citations) if m.citations else [],
            "created_at": m.created_at,
        }
        for m in session.messages
    ]


@router.patch("/sessions/{session_id}", response_model=schemas.ChatSessionOut)
def rename_session(
    session_id: str,
    payload: schemas.ChatSessionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.owner_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = payload.title[:100]
    db.commit()
    db.refresh(session)
    return session


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.owner_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}


@router.post("/sessions/{session_id}/share")
def share_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Generates (or returns the existing) public share token for a session.
    Anyone with the link can view a read-only copy - no login required."""
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.owner_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.share_token:
        session.share_token = uuid.uuid4().hex
        db.commit()

    return {"token": session.share_token}


@router.delete("/sessions/{session_id}/share")
def unshare_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Revokes a session's share link."""
    session = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.id == session_id, models.ChatSession.owner_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.share_token = None
    db.commit()
    return {"message": "Share link revoked"}


@router.get("/share/{token}")
def get_shared_chat(token: str, db: Session = Depends(get_db)):
    """Public, unauthenticated endpoint - renders a read-only shared conversation."""
    session = db.query(models.ChatSession).filter(models.ChatSession.share_token == token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Shared chat not found")

    return {
        "title": session.title,
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "citations": json.loads(m.citations) if m.citations else [],
                "created_at": m.created_at,
            }
            for m in session.messages
        ],
    }


@router.post("/query")
def query(
    payload: schemas.ChatQueryRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    usage.check_and_increment_query(db, current_user.id)

    session = None
    if payload.session_id:
        session = (
            db.query(models.ChatSession)
            .filter(models.ChatSession.id == payload.session_id, models.ChatSession.owner_id == current_user.id)
            .first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

    if not session:
        session = models.ChatSession(
            owner_id=current_user.id,
            title=payload.message[:60],
            document_ids=",".join(payload.document_ids) if payload.document_ids else "",
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    # persist user message
    user_msg = models.ChatMessage(session_id=session.id, role="user", content=payload.message)
    db.add(user_msg)
    db.commit()

    history = [
        {"role": m.role, "content": m.content}
        for m in db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session.id).all()
    ]

    # Capture plain values now, before the request's DB session closes.
    # The generator below runs AFTER this function returns, once the
    # StreamingResponse body is consumed - by then `db`/`current_user`/
    # `session` may already be detached, so never touch ORM objects inside it.
    user_id_value = current_user.id
    session_id_value = session.id
    message_value = payload.message
    document_ids_value = payload.document_ids
    use_web_value = payload.use_web_search
    history_without_last = history[:-1]

    def event_stream():
        full_text = ""
        citations_json = "[]"
        for event in rag_engine.stream_answer(
            user_id=user_id_value,
            query=message_value,
            chat_history=history_without_last,
            document_ids=document_ids_value,
            use_web_search=use_web_value,
        ):
            if event.startswith("event: token"):
                data_line = event.split("data: ", 1)[1]
                full_text += json.loads(data_line).get("text", "")
            elif event.startswith("event: citations"):
                citations_json = event.split("data: ", 1)[1].strip()
            yield event

        # persist assistant message using a fresh session (the request's
        # session may be closed by the time streaming finishes)
        bg_db = SessionLocal()
        try:
            assistant_msg = models.ChatMessage(
                session_id=session_id_value,
                role="assistant",
                content=full_text,
                citations=citations_json,
            )
            bg_db.add(assistant_msg)
            bg_db.commit()
        finally:
            bg_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Session-Id": session_id_value,
            "Access-Control-Expose-Headers": "X-Session-Id",
             "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
