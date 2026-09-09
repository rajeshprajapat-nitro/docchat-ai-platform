"""Shared Gemini API key rotation.

Google's free tier caps requests PER API KEY PER DAY. When multiple free-tier
keys are supplied, this module rotates to the next key automatically whenever
the current one hits its quota.

Supported configuration:

    GOOGLE_API_KEY=KEY1

    GOOGLE_API_KEYS=KEY2,KEY3,KEY4,KEY5,KEY6

The module combines both variables into one list of keys.
"""

import threading

import google.generativeai as genai

from ..config import settings


_lock = threading.Lock()


# ---------------------------------------------------------
# Load all Gemini API keys
# ---------------------------------------------------------

_keys = []

# Key 1: GOOGLE_API_KEY
if settings.GOOGLE_API_KEY:
    key = settings.GOOGLE_API_KEY.strip()
    if key:
        _keys.append(key)


# Keys 2-6: GOOGLE_API_KEYS
# Expected format:
# GOOGLE_API_KEYS=KEY2,KEY3,KEY4,KEY5,KEY6
if settings.GOOGLE_API_KEYS:
    additional_keys = [
        k.strip()
        for k in settings.GOOGLE_API_KEYS.split(",")
        if k.strip()
    ]

    _keys.extend(additional_keys)


# ---------------------------------------------------------
# Safe diagnostic
# ---------------------------------------------------------

print(f"[Gemini] API keys loaded: {len(_keys)}")

for i, key in enumerate(_keys, start=1):
    if len(key) >= 8:
        masked = f"{key[:4]}...{key[-4:]}"
    else:
        masked = "***"

    print(f"[Gemini] Key {i}: {masked}")


if not _keys:
    print("[Gemini] WARNING: No API keys loaded!")


_current_idx = 0
_configured = False


# ---------------------------------------------------------
# Key count
# ---------------------------------------------------------

def key_count() -> int:
    return len(_keys)


# ---------------------------------------------------------
# Apply currently active key
# ---------------------------------------------------------

def _apply_current_key():
    global _configured

    if not _keys:
        return

    genai.configure(api_key=_keys[_current_idx])
    _configured = True


# ---------------------------------------------------------
# Ensure Gemini is configured
# ---------------------------------------------------------

def ensure_configured():
    with _lock:
        if not _configured:
            _apply_current_key()


# ---------------------------------------------------------
# Rotate to next API key
# ---------------------------------------------------------

def rotate() -> bool:
    """Move to the next key when more than one key is configured.

    Returns True if a different key is now active.
    """

    global _current_idx

    with _lock:
        if len(_keys) <= 1:
            return False

        _current_idx = (_current_idx + 1) % len(_keys)

        _apply_current_key()

        print(
            f"[Gemini] Rotated to API key "
            f"{_current_idx + 1}/{len(_keys)}"
        )

        return True


# ---------------------------------------------------------
# Detect quota / access errors
# ---------------------------------------------------------

def is_quota_error(exc: Exception) -> bool:
    """Return True when switching API keys may help."""

    text = str(exc)

    return (
        "429" in text
        or "ResourceExhausted" in text
        or "quota" in text.lower()
        or "PermissionDenied" in text
        or "PERMISSION_DENIED" in text
        or "denied access" in text.lower()
    )


# ---------------------------------------------------------
# Execute function with automatic key rotation
# ---------------------------------------------------------

def call_with_rotation(fn, *args, **kwargs):
    """Run fn(*args, **kwargs).

    If the current Gemini API key hits a quota/access error,
    automatically rotate to the next configured key.

    Each configured key is tried at most once per call.
    """

    ensure_configured()

    attempts = max(len(_keys), 1)
    last_exc = None

    for attempt in range(attempts):
        try:
            print(
                f"[Gemini] Request using key "
                f"{_current_idx + 1}/{len(_keys)}"
            )

            return fn(*args, **kwargs)

        except Exception as e:
            last_exc = e

            print(
                f"[Gemini] Key {_current_idx + 1}/{len(_keys)} "
                f"failed: {type(e).__name__}"
            )

            if is_quota_error(e) and rotate():
                continue

            raise

    raise last_exc