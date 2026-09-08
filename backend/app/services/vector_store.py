"""Pinecone vector store wrapper: index management, upsert, and filtered similarity search."""
from typing import List, Dict, Optional
from pinecone import Pinecone, ServerlessSpec
from ..config import settings

_pc: Optional[Pinecone] = None
_index = None


def get_index():
    global _pc, _index
    if _index is not None:
        return _index

    _pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    existing = [idx.name for idx in _pc.list_indexes()]

    if settings.PINECONE_INDEX not in existing:
        _pc.create_index(
            name=settings.PINECONE_INDEX,
            dimension=settings.EMBEDDING_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud=settings.PINECONE_CLOUD, region=settings.PINECONE_REGION),
        )

    _index = _pc.Index(settings.PINECONE_INDEX)
    return _index


def upsert_chunks(user_id: str, document_id: str, filename: str, chunks: List[Dict], vectors: List[List[float]]):
    """
    chunks: list of {chunk_index, page, text}
    vectors: matching list of embedding vectors
    Namespacing by user_id isolates each user's data in the same index.
    """
    index = get_index()
    to_upsert = []
    for chunk, vector in zip(chunks, vectors):
        vec_id = f"{document_id}::{chunk['chunk_index']}"
        to_upsert.append({
            "id": vec_id,
            "values": vector,
            "metadata": {
                "document_id": document_id,
                "filename": filename,
                "chunk_index": chunk["chunk_index"],
                "page": chunk.get("page"),
                "text": chunk["text"][:2000],  # metadata size guard
            },
        })

    # Pinecone recommends batches of ~100
    for i in range(0, len(to_upsert), 100):
        index.upsert(vectors=to_upsert[i:i + 100], namespace=user_id)


def similarity_search(user_id: str, query_vector: List[float], top_k: int = None, document_ids: Optional[List[str]] = None) -> List[Dict]:
    index = get_index()
    top_k = top_k or settings.TOP_K

    query_filter = None
    if document_ids:
        query_filter = {"document_id": {"$in": document_ids}}

    result = index.query(
        vector=query_vector,
        top_k=top_k,
        namespace=user_id,
        filter=query_filter,
        include_metadata=True,
    )

    matches = []
    for match in result.matches:
        matches.append({
            "score": match.score,
            "document_id": match.metadata.get("document_id"),
            "filename": match.metadata.get("filename"),
            "chunk_index": match.metadata.get("chunk_index"),
            "page": match.metadata.get("page"),
            "text": match.metadata.get("text"),
        })
    return matches


def delete_document_vectors(user_id: str, document_id: str):
    """Delete all vectors for a document using metadata filter."""
    index = get_index()
    index.delete(namespace=user_id, filter={"document_id": {"$eq": document_id}})
