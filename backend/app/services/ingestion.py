"""Background ingestion pipeline: parse -> chunk -> embed -> upsert -> summarize -> update DB status.
Uses its own DB session (not the request's) since it runs after the request completes."""
import json
from ..database import SessionLocal
from .. import models
from . import pdf_processor, embeddings, vector_store, summarizer


def ingest_document(document_id: str):
    db = SessionLocal()
    try:
        document = db.query(models.Document).filter(models.Document.id == document_id).first()
        if not document:
            return

        chunks = pdf_processor.process_pdf(document.file_path)

        if not chunks:
            document.status = "failed"
            db.commit()
            return

        texts = [c["text"] for c in chunks]
        vectors = embeddings.embed_texts(texts)

        vector_store.upsert_chunks(
            user_id=document.owner_id,
            document_id=document.id,
            filename=document.filename,
            chunks=chunks,
            vectors=vectors,
        )

        pages = {c["page"] for c in chunks}
        document.num_pages = len(pages)
        document.num_chunks = len(chunks)

        # Auto-summary + key topics (best-effort - never blocks readiness on failure)
        combined_text = " ".join(texts)[:8000]
        summary_result = summarizer.summarize_document(combined_text)
        if summary_result:
            document.summary = summary_result.get("summary")
            document.key_topics = json.dumps(summary_result.get("topics", []))
            document.suggested_questions = json.dumps(summary_result.get("suggested_questions", []))

        document.status = "ready"
        db.commit()

    except Exception:
        db.rollback()
        document = db.query(models.Document).filter(models.Document.id == document_id).first()
        if document:
            document.status = "failed"
            db.commit()
        raise
    finally:
        db.close()
