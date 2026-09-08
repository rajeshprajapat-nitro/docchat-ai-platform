"""Embedding generation via Google Gemini (free tier), batched for efficiency.
Routes through gemini_client so quota errors automatically rotate API keys."""
from typing import List
import google.generativeai as genai
from ..config import settings
from . import gemini_client


def _embed_one(text: str, task_type: str) -> List[float]:
    result = genai.embed_content(
        model=settings.EMBEDDING_MODEL,
        content=text,
        task_type=task_type,
        output_dimensionality=settings.EMBEDDING_DIM,
    )
    return result["embedding"]


def embed_texts(texts: List[str], batch_size: int = 100) -> List[List[float]]:
    """Embed a list of texts. Loops one-by-one for broad SDK compatibility -
    still fast enough for typical PDF chunk counts."""
    all_embeddings: List[List[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        for text in batch:
            embedding = gemini_client.call_with_rotation(_embed_one, text, "retrieval_document")
            all_embeddings.append(embedding)

    return all_embeddings


def embed_query(text: str) -> List[float]:
    return gemini_client.call_with_rotation(_embed_one, text, "retrieval_query")
