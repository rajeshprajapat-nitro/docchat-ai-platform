"""Handles PDF text extraction and chunking."""
from typing import List, Dict
import fitz  # PyMuPDF
from ..config import settings


def extract_pages(file_path: str) -> List[Dict]:
    """Returns list of {page_number, text}."""
    pages = []
    doc = fitz.open(file_path)
    for i, page in enumerate(doc):
        text = page.get_text("text")
        if text.strip():
            pages.append({"page_number": i + 1, "text": text})
    doc.close()
    return pages


def chunk_text(text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
    """Sliding-window word-based chunker with overlap for better retrieval context."""
    chunk_size = chunk_size or settings.CHUNK_SIZE
    overlap = overlap or settings.CHUNK_OVERLAP

    words = text.split()
    if not words:
        return []

    chunks = []
    step = max(chunk_size - overlap, 1)
    for start in range(0, len(words), step):
        chunk_words = words[start:start + chunk_size]
        if not chunk_words:
            break
        chunks.append(" ".join(chunk_words))
        if start + chunk_size >= len(words):
            break
    return chunks


def process_pdf(file_path: str) -> List[Dict]:
    """Full pipeline: extract text per page, then chunk. Returns list of {chunk_index, page, text}."""
    pages = extract_pages(file_path)
    result = []
    chunk_idx = 0
    for page in pages:
        for c in chunk_text(page["text"]):
            result.append({"chunk_index": chunk_idx, "page": page["page_number"], "text": c})
            chunk_idx += 1
    return result
