"""Auto-summarization of newly uploaded documents: generates a short summary
and a handful of key topics right after ingestion, shown in the UI before the
user even asks a question - similar to how modern doc-AI tools give an
instant overview. Routes through gemini_client for automatic key rotation."""
import json
from typing import Optional, Dict
import google.generativeai as genai
from ..config import settings
from . import gemini_client

PROMPT_TEMPLATE = """Read the following document excerpt and respond with ONLY a JSON object
(no markdown, no explanation) in this exact shape:
{{"summary": "<2-3 sentence plain-English summary>", "topics": ["<topic1>", "<topic2>", "<topic3>", "<topic4>", "<topic5>"], "suggested_questions": ["<question1>", "<question2>", "<question3>"]}}

The suggested_questions should be natural starter questions a reader could ask about this document.

Document excerpt:
{text}
"""


def _run(text: str) -> Dict:
    model = genai.GenerativeModel(model_name=settings.LITE_MODEL)
    resp = model.generate_content(
        PROMPT_TEMPLATE.format(text=text),
        generation_config={"temperature": 0.2},
    )
    raw = (resp.text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").replace("json", "", 1).strip()
    parsed = json.loads(raw)
    return {
        "summary": str(parsed.get("summary", "")).strip(),
        "topics": [str(t).strip() for t in parsed.get("topics", []) if str(t).strip()][:5],
        "suggested_questions": [str(q).strip() for q in parsed.get("suggested_questions", []) if str(q).strip()][:3],
    }


def summarize_document(text: str) -> Optional[Dict]:
    """Best-effort summary generation. Returns None on any failure (including
    every rotated key being exhausted) so a failed summary never blocks the
    document from becoming 'ready'."""
    if not text.strip():
        return None
    try:
        return gemini_client.call_with_rotation(_run, text)
    except Exception:
        return None
