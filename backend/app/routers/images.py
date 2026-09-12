import base64
import os
import traceback
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from openai import OpenAI

from .. import auth, models
from ..config import settings


router = APIRouter(
    prefix="/images",
    tags=["images"],
)


class ImageGenerationRequest(BaseModel):
    prompt: str
    session_id: str | None = None


# -----------------------------------------
# Gemini API keys
# -----------------------------------------


def _get_gemini_api_keys():
    keys = []

    # First use GOOGLE_API_KEYS
    if settings.GOOGLE_API_KEYS:
        keys.extend(
            [
                key.strip()
                for key in settings.GOOGLE_API_KEYS.split(",")
                if key.strip()
            ]
        )

    # Fallback to GOOGLE_API_KEY
    if (
        not keys
        and settings.GOOGLE_API_KEY
    ):
        key = settings.GOOGLE_API_KEY.strip()

        if key:
            keys.append(key)

    return keys


# -----------------------------------------
# Gemini OpenAI-compatible client
# -----------------------------------------


def _get_gemini_client():
    keys = _get_gemini_api_keys()

    if not keys:
        raise HTTPException(
            status_code=500,
            detail=(
                "Gemini API key is not configured."
            ),
        )

    # Use first available key.
    # Your existing GOOGLE_API_KEYS can contain
    # multiple comma-separated keys.
    api_key = keys[0].strip()

    return OpenAI(
        api_key=api_key,
        base_url=(
            "https://generativelanguage.googleapis.com/"
            "v1beta/openai/"
        ),
        timeout=120.0,
        max_retries=1,
    )


# -----------------------------------------
# Generate image
# -----------------------------------------


@router.post("/generate")
def generate_image(
    payload: ImageGenerationRequest,
    current_user: models.User = Depends(
        auth.get_current_user
    ),
):
    prompt = (
        payload.prompt or ""
    ).strip()

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail=(
                "Image prompt cannot be empty."
            ),
        )

    if len(prompt) > 4000:
        raise HTTPException(
            status_code=400,
            detail=(
                "Image prompt is too long."
            ),
        )

    print(
        "[Image] Starting Gemini image generation"
    )

    print(
        f"[Image] User: {current_user.id}"
    )

    print(
        f"[Image] Model: "
        f"{settings.GEMINI_IMAGE_MODEL}"
    )

    keys = _get_gemini_api_keys()

    print(
        f"[Image] Gemini API keys available: "
        f"{len(keys)}"
    )

    if not keys:
        raise HTTPException(
            status_code=500,
            detail=(
                "Gemini API key is not configured."
            ),
        )

    try:
        client = _get_gemini_client()

        response = client.images.generate(
            model=settings.GEMINI_IMAGE_MODEL,
            prompt=prompt,
            n=1,
            response_format="b64_json",
        )

    except Exception as exc:
        print(
            "[Image] Gemini generation failed:",
            repr(exc),
        )

        traceback.print_exc()

        error_text = str(exc)

        # Friendly quota error
        if (
            "429" in error_text
            or "quota" in error_text.lower()
            or "resource exhausted"
            in error_text.lower()
        ):
            raise HTTPException(
                status_code=429,
                detail=(
                    "Gemini image generation quota "
                    "is currently unavailable. "
                    "Please try again later."
                ),
            )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to generate the image "
                "right now. Please try again."
            ),
        )

    # -----------------------------------------
    # Validate response
    # -----------------------------------------

    if not response.data:
        raise HTTPException(
            status_code=500,
            detail=(
                "Gemini returned no image."
            ),
        )

    image_data = response.data[0]

    b64_json = getattr(
        image_data,
        "b64_json",
        None,
    )

    if not b64_json:
        raise HTTPException(
            status_code=500,
            detail=(
                "Gemini returned no image data."
            ),
        )

    # -----------------------------------------
    # Decode image
    # -----------------------------------------

    try:
        image_bytes = base64.b64decode(
            b64_json
        )

    except Exception as exc:
        print(
            "[Image] Base64 decode failed:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Invalid image data returned "
                "by Gemini."
            ),
        )

    # -----------------------------------------
    # Save image
    # -----------------------------------------

    generated_dir = os.path.abspath(
        os.path.join(
            settings.UPLOAD_DIR,
            "generated",
            str(current_user.id),
        )
    )

    os.makedirs(
        generated_dir,
        exist_ok=True,
    )

    filename = (
        f"{uuid.uuid4().hex}.png"
    )

    file_path = os.path.join(
        generated_dir,
        filename,
    )

    try:
        with open(
            file_path,
            "wb",
        ) as image_file:
            image_file.write(
                image_bytes
            )

    except Exception as exc:
        print(
            "[Image] Failed to save image:",
            repr(exc),
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                "Generated image could not "
                "be saved."
            ),
        )

    image_url = (
        f"/images/generated/"
        f"{current_user.id}/"
        f"{filename}"
    )

    print(
        "[Image] Image generated successfully"
    )

    print(
        f"[Image] Saved: {file_path}"
    )

    return {
        "success": True,
        "image_url": image_url,
        "prompt": prompt,
        "session_id": payload.session_id,
        "provider": "gemini",
        "model": settings.GEMINI_IMAGE_MODEL,
    }


# -----------------------------------------
# Serve generated image
# -----------------------------------------


@router.get(
    "/generated/{user_id}/{filename}"
)
def get_generated_image(
    user_id: str,
    filename: str,
    current_user: models.User = Depends(
        auth.get_current_user
    ),
):
    # User can only access their own images.
    if str(current_user.id) != str(user_id):
        raise HTTPException(
            status_code=403,
            detail="Access denied.",
        )

    generated_dir = os.path.abspath(
        os.path.join(
            settings.UPLOAD_DIR,
            "generated",
            str(current_user.id),
        )
    )

    safe_filename = os.path.basename(
        filename
    )

    file_path = os.path.abspath(
        os.path.join(
            generated_dir,
            safe_filename,
        )
    )

    # Path traversal protection
    if not file_path.startswith(
        generated_dir + os.sep
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid file path.",
        )

    if not os.path.isfile(
        file_path
    ):
        raise HTTPException(
            status_code=404,
            detail=(
                "Generated image not found."
            ),
        )

    return FileResponse(
        file_path,
        media_type="image/png",
    )