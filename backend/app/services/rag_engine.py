"""
Core RAG + general-chat orchestration (ChatGPT/Perplexity-style), with two
differentiators most portfolio RAG apps skip:

  - Query rewriting: the raw user question is expanded/clarified by the LLM
    before embedding, using recent chat history for context - improves
    retrieval recall on short or ambiguous follow-up questions.
  - Groundedness scoring: after the answer is generated, a second lightweight
    LLM pass checks how well the answer is actually supported by the cited
    sources, and returns a 0-100 score shown to the user - a basic but real
    hallucination-detection mechanism.

Pipeline:
1. Rewrite the query for better retrieval (falls back to the raw query on failure)
2. Embed + retrieve top-k document chunks from Pinecone
3. Optionally search + scrape the live web for extra grounding
4. If sources are found, answer grounded in them with numbered citations.
   If not, fall back to the model's own general knowledge (never refuses).
5. Stream the answer, then emit citations, a groundedness score, and 3
   suggested follow-up questions.
"""
import json
from typing import List, Dict, Optional, Generator
import google.generativeai as genai
from ..config import settings
from . import embeddings, vector_store, web_search, gemini_client

SYSTEM_PROMPT = """You are DocChat, a precise, helpful, intelligent, and conversational AI assistant.

CONVERSATIONAL BEHAVIOR:
- Talk naturally with the user, like a modern conversational AI assistant such as ChatGPT.
- Users may talk to you about personal situations, feelings, experiences, plans, opinions, casual topics, education, coding, technology, or general questions.
- If the user shares something personal, emotional, or casual, respond naturally, respectfully, and empathetically.
- Do not force every conversation to be about uploaded documents, RAG, or research.
- For greetings, casual conversation, introductions, jokes, general questions, and personal discussion, answer directly and naturally.
- Maintain context from the recent conversation and understand follow-up questions.
- Ask a natural follow-up question when it would make the conversation more useful.
- Match the user's language and tone when appropriate. If the user uses Hinglish, you may respond in Hinglish.
- Do not pretend to be human or claim to have real-world personal experiences, emotions, or a personal life.
- Be honest about what you know and what you do not know.

DOCUMENT / RAG BEHAVIOR:
- You may be given numbered SOURCES below, consisting of excerpts from the user's uploaded documents and/or live web results.
- If sources are relevant to the user's question, use them as supporting evidence and cite factual claims inline like [1], [2], matching the source numbers.
- If the sources conflict, briefly mention the disagreement.
- If the sources do not fully answer the question, clearly explain what is missing and, when appropriate, provide clearly-labeled general knowledge.
- If the question is unrelated to the provided documents, answer normally instead of forcing the documents into the response.
- If NO sources are provided, answer normally from your own general knowledge.
- Never fabricate citations or source information.
- Do not start every answer with phrases such as "According to the sources" when the question is simply conversational or unrelated to the sources.

CREATOR INFORMATION:
DocChat was built and developed by Rajesh Prajapat, a Computer Science Engineering student at Government Engineering College, Ajmer, Rajasthan.

If the user asks who built, created, developed, made, designed, or is behind DocChat, clearly identify Rajesh Prajapat as the creator and developer of DocChat.

If the user asks about Rajesh Prajapat, provide the following publicly relevant information when appropriate:

- Name: Rajesh Prajapat
- Field: Computer Science Engineering
- Institution: Government Engineering College, Ajmer, Rajasthan
- Degree: B.Tech in Computer Science Engineering
- Expected graduation: 2027
- Areas of interest: Artificial Intelligence, Machine Learning, Data Science, and software development
- DocChat: Creator and developer of the DocChat AI Document Intelligence Platform
- LinkedIn: https://www.linkedin.com/in/rajeshprajapat-nitro/

If the user asks for Rajesh Prajapat's LinkedIn profile, provide this direct link:
https://www.linkedin.com/in/rajeshprajapat-nitro/

If appropriate, you may describe Rajesh Prajapat as:
"Rajesh Prajapat is a Computer Science Engineering student at Government Engineering College, Ajmer, Rajasthan, with interests in Artificial Intelligence, Machine Learning, Data Science, and software development. He is the creator and developer of DocChat."

Only provide information that is explicitly known and appropriate to share.
Do not invent personal information, contact details, private information, achievements, or other facts about Rajesh Prajapat.
Do not claim that another person or organization built DocChat.

GENERAL RESPONSE STYLE:
- Be helpful, natural, concise, and well-structured.
- Use bullet points or short paragraphs for multi-part answers.
- Avoid unnecessary repetition.
- Give direct answers first, then additional explanation when useful.
- For simple conversational questions, keep the response conversational rather than overly formal.
"""


REWRITE_PROMPT_TEMPLATE = """Rewrite the user's latest message into a single, self-contained, well-specified search query only when the message requires document or web retrieval.

Use the recent conversation to resolve pronouns, references, abbreviations, and implicit context.

IMPORTANT:
- If the latest message is casual conversation, a greeting, a personal discussion, an opinion, a joke, or a question that can be answered without document/web retrieval, return the original user message with minimal clarification rather than turning it into an artificial research query.
- Do not add information that is not supported by the conversation.
- Preserve the user's actual informational intent.
- This rewritten query will be used internally for document/web retrieval and will NOT be shown to the user.

Return ONLY the rewritten query text, nothing else - no quotes, no explanation.

Recent conversation:
{history}

Latest message:
{query}
"""

FOLLOWUP_AND_GROUNDEDNESS_PROMPT = """You are a fact-checking and follow-up assistant. Given the
SOURCES (if any) and the QUESTION/ANSWER below, do two things and return ONLY a single JSON object
in this exact shape, nothing else - no markdown, no explanation:

{{"score": <integer 0-100, or -1 if SOURCES is empty>, "note": "<one short sentence>", "suggestions": ["<q1>", "<q2>", "<q3>"]}}

- "score": how well the answer's claims are supported by SOURCES (100 = fully supported, 0 =
  unsupported speculation). If SOURCES is empty, use -1 and note "No sources were used; answer is
  from general knowledge."
- "suggestions": exactly 3 short, natural follow-up questions the user might want to ask next.

SOURCES:
{sources}

QUESTION: {question}

ANSWER:
{answer}
"""


def _lite_model():
    """A separate, lighter Gemini model instance used only for background
    extras. Each model has its own free-tier daily quota, so keeping this
    off the main chat model roughly doubles total free capacity."""
    return genai.GenerativeModel(model_name=settings.LITE_MODEL)


def _generate_extras(sources_block: str, question: str, answer: str) -> Dict:
    """Single combined call for groundedness + follow-up suggestions (instead
    of two separate calls) - halves background API usage per turn. Best-effort:
    returns empty results on any failure (quota, parsing, etc.) without ever
    breaking the main answer, which has already been shown to the user."""
    def _run():
        model = _lite_model()
        prompt = FOLLOWUP_AND_GROUNDEDNESS_PROMPT.format(
            sources=(sources_block or "(none)")[:4000],
            question=question[:500],
            answer=answer[:1500],
        )
        resp = model.generate_content(prompt, generation_config={"temperature": 0.3})
        text = (resp.text or "").strip()
        if text.startswith("```"):
            text = text.strip("`").replace("json", "", 1).strip()
        parsed = json.loads(text)
        groundedness = None
        if "score" in parsed:
            groundedness = {"score": int(parsed["score"]), "note": str(parsed.get("note", ""))}
        suggestions = [str(q).strip() for q in parsed.get("suggestions", []) if str(q).strip()][:3]
        return {"groundedness": groundedness, "suggestions": suggestions}

    try:
        return gemini_client.call_with_rotation(_run)
    except Exception:
        return {"groundedness": None, "suggestions": []}


def retrieve(user_id: str, query: str, document_ids: Optional[List[str]] = None, top_k: int = None) -> List[Dict]:
    query_vector = embeddings.embed_query(query)
    return vector_store.similarity_search(user_id, query_vector, top_k=top_k, document_ids=document_ids)


def _build_sources(matches: List[Dict], web_results: List[Dict]):
    """Combine document matches and web results into one numbered source list,
    returning both the prompt text block and a parallel citation list."""
    lines = []
    citations = []
    idx = 1

    for m in matches:
        page_info = f", page {m['page']}" if m.get("page") else ""
        lines.append(f"[{idx}] (Document: {m['filename']}{page_info})\n{m['text']}")
        citations.append({
            "type": "document",
            "index": idx,
            "document_id": m["document_id"],
            "filename": m["filename"],
            "chunk_index": m["chunk_index"],
            "page": m.get("page"),
            "snippet": m["text"][:280],
            "score": round(float(m["score"]), 4),
        })
        idx += 1

    for w in web_results:
        content = w.get("content") or w.get("snippet") or ""
        lines.append(f"[{idx}] (Web: {w['title']} — {w['url']})\n{content[:2500]}")
        citations.append({
            "type": "web",
            "index": idx,
            "title": w["title"],
            "url": w["url"],
            "snippet": (w.get("snippet") or content)[:280],
        })
        idx += 1

    return "\n\n".join(lines), citations


def _history_to_gemini(chat_history: Optional[List[Dict]]) -> List[Dict]:
    if not chat_history:
        return []
    converted = []
    for h in chat_history[-6:]:
        role = "model" if h["role"] == "assistant" else "user"
        converted.append({"role": role, "parts": [h["content"]]})
    return converted


def _rewrite_query(model, query: str, chat_history: Optional[List[Dict]]) -> str:
    """Best-effort query rewriting for better retrieval. Falls back to the
    original query on any failure or empty history (nothing to resolve)."""
    if not chat_history:
        return query
    try:
        history_text = "\n".join(f"{h['role']}: {h['content'][:300]}" for h in chat_history[-4:])
        prompt = REWRITE_PROMPT_TEMPLATE.format(history=history_text, query=query)
        resp = model.generate_content(prompt, generation_config={"temperature": 0.1})
        rewritten = (resp.text or "").strip().strip('"')
        return rewritten if rewritten else query
    except Exception:
        return query


def stream_answer(
    user_id: str,
    query: str,
    chat_history: Optional[List[Dict]] = None,
    document_ids: Optional[List[str]] = None,
    use_web_search: bool = False,
) -> Generator[str, None, None]:
    """
    Yields Server-Sent-Event formatted strings:
      event: token         -> partial answer text
      event: citations     -> JSON array of sources used; [] if none
      event: groundedness  -> {"score": 0-100 or -1, "note": "..."}
      event: suggestions   -> JSON array of up to 3 suggested follow-up questions
      event: done          -> end marker

    Speed note: retrieval uses the raw query directly (no blocking query-rewrite
    call before the first token) - keeps time-to-first-token fast, ChatGPT-like.
    """
    gemini_client.ensure_configured()

    matches = retrieve(user_id, query, document_ids=document_ids)

    # Smart auto web-search fallback: even if the user hasn't toggled web
    # search on, automatically pull in live web results when the documents
    # don't cover the question well (no matches, or weak top match) - so
    # "summarize this PDF" stays document-only, but "how does this compare to
    # X" automatically reaches beyond the PDF, like ChatGPT browsing would.
    top_score = matches[0]["score"] if matches else 0
    should_auto_web = (not matches) or top_score < 0.45
    do_web_search = use_web_search or should_auto_web

    web_results = []
    if do_web_search:
        web_results = web_search.fetch_web_context(query)

    has_sources = bool(matches or web_results)
    context_block, citations = _build_sources(matches, web_results) if has_sources else ("", [])

    if has_sources:
        user_content = f"Sources:\n\n{context_block}\n\nQuestion: {query}"
    else:
        user_content = query

    history = _history_to_gemini(chat_history)

    def _start_stream():
        model = genai.GenerativeModel(model_name=settings.CHAT_MODEL, system_instruction=SYSTEM_PROMPT)
        chat = model.start_chat(history=history)
        return chat.send_message(user_content, stream=True, generation_config={"temperature": 0.3})

    full_text = ""
    last_exc = None
    attempts = max(gemini_client.key_count(), 1)

    for attempt in range(attempts):
        try:
            response = _start_stream()
            for chunk in response:
                delta = chunk.text if chunk.text else ""
                if delta:
                    full_text += delta
                    yield f"event: token\ndata: {json.dumps({'text': delta})}\n\n"
            last_exc = None
            break
        except Exception as e:
            last_exc = e
            if full_text:
                # Already streamed partial content - retrying would duplicate
                # or confuse the answer, so stop here rather than retry.
                break
            if gemini_client.is_quota_error(e) and gemini_client.rotate():
                continue
            break

    if last_exc is not None and not full_text:
        if gemini_client.is_quota_error(last_exc):
            friendly = (
                "⚠️ The AI model is temporarily unavailable on the configured key(s) - "
                + ("all configured keys have hit their limit or access issue" if gemini_client.key_count() > 1 else "the free daily quota has been used up")
                + ". Please wait a bit and try again, or add another API key."
            )
        else:
            friendly = "⚠️ Something went wrong generating a response. Please try again."
        full_text = friendly
        yield f"event: token\ndata: {json.dumps({'text': friendly})}\n\n"
        yield f"event: citations\ndata: {json.dumps(citations)}\n\n"
        yield "event: done\ndata: {}\n\n"
        return

    yield f"event: citations\ndata: {json.dumps(citations)}\n\n"

    # Fire "done" as soon as the visible answer is complete, so the Send
    # button and input re-enable immediately (ChatGPT-like responsiveness).
    # Groundedness + suggestions are best-effort extras that stream in a
    # moment later and just patch the same message once ready.
    yield "event: done\ndata: {}\n\n"

    # One combined call (on the separate lite-model quota) instead of two,
    # to conserve the free tier's very limited per-model daily request cap.
    extras = _generate_extras(context_block, query, full_text)
    if extras.get("groundedness"):
        yield f"event: groundedness\ndata: {json.dumps(extras['groundedness'])}\n\n"
    yield f"event: suggestions\ndata: {json.dumps(extras.get('suggestions', []))}\n\n"
