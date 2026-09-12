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


# =========================================================
# REQUEST SCHEMA
# =========================================================

class ImageGenerationRequest(BaseModel):
    prompt: str
    session_id: str | None = None


# =========================================================
# OPENAI CLIENT
# =========================================================

def _get_openai_client():
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API key is not configured.",
        )

    return OpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=120.0,
        max_retries=2,
    )


# =========================================================
# GENERATE IMAGE
# =========================================================

@router.post("/generate")
def generate_image(
    payload: ImageGenerationRequest,
    current_user: models.User = Depends(
        auth.get_current_user
    ),
):
    prompt = (payload.prompt or "").strip()

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="Image prompt cannot be empty.",
        )

    if len(prompt) > 4000:
        raise HTTPException(
            status_code=400,
            detail="Image prompt is too long.",
        )

    client = _get_openai_client()

    print(
        f"[Image] Generating image for user "
        f"{current_user.id}"
    )

    print(
        f"[Image] Model: {settings.IMAGE_MODEL}"
    )

    try:
        result = client.images.generate(
            model=settings.IMAGE_MODEL,
            prompt=prompt,
        )

    except Exception as exc:
        print(
            "[Image] OpenAI generation failed:",
            repr(exc),
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                "OpenAI image generation failed. "
                "Check Render logs for the exact error."
            ),
        )

    # =====================================================
    # CHECK RESPONSE
    # =====================================================

    if not result.data:
        raise HTTPException(
            status_code=500,
            detail="Image generation returned no image.",
        )

    image_data = result.data[0]

    b64_json = getattr(
        image_data,
        "b64_json",
        None,
    )

    if not b64_json:
        raise HTTPException(
            status_code=500,
            detail=(
                "Image generation returned "
                "no base64 image data."
            ),
        )

    # =====================================================
    # DECODE IMAGE
    # =====================================================

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
            detail="Invalid image data returned by OpenAI.",
        )

    # =====================================================
    # SAVE IMAGE
    # =====================================================

    generated_dir = os.path.join(
        settings.UPLOAD_DIR,
        "generated",
        str(current_user.id),
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
            image_file.write(image_bytes)

    except Exception as exc:
        print(
            "[Image] File save failed:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save generated image.",
        )

    # =====================================================
    # IMAGE URL
    # =====================================================

    image_url = (
        f"/images/generated/"
        f"{current_user.id}/"
        f"{filename}"
    )

    print(
        f"[Image] Image saved: {file_path}"
    )

    return {
        "success": True,
        "image_url": image_url,
        "prompt": prompt,
        "session_id": payload.session_id,
    }


# =========================================================
# SERVE GENERATED IMAGE
# =========================================================

@router.get(
    "/generated/{user_id}/{filename}"
)
def get_generated_image(
    user_id: int,
    filename: str,
    current_user: models.User = Depends(
        auth.get_current_user
    ),
):
    # -----------------------------------------------------
    # Security: user can only access own images
    # -----------------------------------------------------

    if user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this image.",
        )

    safe_filename = os.path.basename(
        filename
    )

    generated_dir = os.path.abspath(
        os.path.join(
            settings.UPLOAD_DIR,
            "generated",
            str(current_user.id),
        )
    )

    file_path = os.path.abspath(
        os.path.join(
            generated_dir,
            safe_filename,
        )
    )

    # -----------------------------------------------------
    # Path traversal protection
    # -----------------------------------------------------

    if not file_path.startswith(
        generated_dir + os.sep
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid image path.",
        )

    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=404,
            detail="Generated image not found.",
        )

    return FileResponse(
        file_path,
        media_type="image/png",
        filename=safe_filename,
    )