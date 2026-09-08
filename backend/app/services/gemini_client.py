"""Shared Gemini API key rotation.

Google's free tier caps requests PER API KEY PER DAY. When multiple free-tier
keys are supplied (GOOGLE_API_KEYS, comma-separated), this module rotates to
the next key automatically whenever the current one hits its quota - so total
free daily capacity stacks across keys instead of being capped by just one.

All Gemini-calling services (embeddings, rag_engine, summarizer) should route
through here instead of calling genai.configure() themselves.
"""
import threading
import google.generativeai as genai
from ..config import settings

_lock = threading.Lock()

_keys = [k.strip() for k in settings.GOOGLE_API_KEYS.split(",") if k.strip()]
if not _keys and settings.GOOGLE_API_KEY:
    _keys = [settings.GOOGLE_API_KEY]

_current_idx = 0
_configured = False


def key_count() -> int:
    return len(_keys)


def _apply_current_key():
    global _configured
    if not _keys:
        return
    genai.configure(api_key=_keys[_current_idx])
    _configured = True


def ensure_configured():
    with _lock:
        if not _configured:
            _apply_current_key()


def rotate() -> bool:
    """Move to the next key, if more than one is configured. Returns True if
    a different key is now active (so the caller should retry)."""
    global _current_idx
    with _lock:
        if len(_keys) <= 1:
            return False
        _current_idx = (_current_idx + 1) % len(_keys)
        _apply_current_key()
        return True


def is_quota_error(exc: Exception) -> bool:
    """True for errors where switching to a different API key is likely to
    help: quota exhaustion, or the key/project being denied access outright
    (common for freshly-created Google accounts Google flags as suspicious)."""
    text = str(exc)
    return (
        "429" in text
        or "ResourceExhausted" in text
        or "quota" in text.lower()
        or "PermissionDenied" in text
        or "PERMISSION_DENIED" in text
        or "denied access" in text.lower()
    )


def call_with_rotation(fn, *args, **kwargs):
    """Run fn(*args, **kwargs); on a quota error, rotate to the next key and
    retry - up to once per configured key. Raises the last error if every
    key is exhausted."""
    ensure_configured()
    attempts = max(len(_keys), 1)
    last_exc = None
    for _ in range(attempts):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if is_quota_error(e) and rotate():
                continue
            raise
    raise last_exc
