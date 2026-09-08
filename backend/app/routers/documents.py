import os
import shutil
import uuid
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db
from ..config import settings
from ..services import ingestion, usage, vector_store

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf"}


@router.post("/upload", response_model=schemas.DocumentOut)
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    usage.check_and_increment_upload(db, current_user.id)

    doc_id = str(uuid.uuid4())
    user_dir = os.path.join(settings.UPLOAD_DIR, current_user.id)
    os.makedirs(user_dir, exist_ok=True)
    dest_path = os.path.join(user_dir, f"{doc_id}{ext}")

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    document = models.Document(
        id=doc_id,
        owner_id=current_user.id,
        filename=file.filename,
        file_path=dest_path,
        status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Ingest in background so upload responds immediately; frontend polls status.
    background_tasks.add_task(ingestion.ingest_document, document.id)

    return document


@router.get("", response_model=List[schemas.DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return (
        db.query(models.Document)
        .filter(models.Document.owner_id == current_user.id)
        .order_by(models.Document.created_at.desc())
        .all()
    )


@router.get("/{document_id}", response_model=schemas.DocumentOut)
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.owner_id == current_user.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/file")
def preview_document(
    document_id: str,
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Serves the raw PDF for inline preview. Browsers rendering a PDF in an
    <iframe>/<embed> can't send an Authorization header, so the JWT is
    passed as a query param here instead and verified manually.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.owner_id == user_id)
        .first()
    )
    if not doc or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document not found")

    return FileResponse(doc.file_path, media_type="application/pdf", filename=doc.filename)


@router.get("/{document_id}/insights")
def get_document_insights(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Auto-generated summary, key topics, and suggested starter questions -
    produced right after upload, shown before the user even asks anything."""
    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.owner_id == current_user.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "summary": doc.summary or "",
        "key_topics": json.loads(doc.key_topics) if doc.key_topics else [],
        "suggested_questions": json.loads(doc.suggested_questions) if doc.suggested_questions else [],
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.owner_id == current_user.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    vector_store.delete_document_vectors(current_user.id, document_id)

    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted"}
