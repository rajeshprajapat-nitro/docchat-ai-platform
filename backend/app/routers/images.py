import base64
import os
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
        api_key=settings.OPENAI_API_KEY
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

    try:
        result = client.images.generate(
            model=settings.IMAGE_MODEL,
            prompt=prompt,
        )

    except Exception as exc:
        print(
            "Image generation error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to generate the image right now. "
                "Please try again."
            ),
        )

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
            detail="Image generation returned no image data.",
        )

    try:
        image_bytes = base64.b64decode(
            b64_json
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Invalid image data returned by image service.",
        )

    # -----------------------------------------------------
    # SAVE GENERATED IMAGE
    # -----------------------------------------------------

    generated_dir = os.path.join(
        settings.UPLOAD_DIR,
        "generated",
    )

    os.makedirs(
        generated_dir,
        exist_ok=True,
    )

    filename = (
        f"{current_user.id}_"
        f"{uuid.uuid4().hex}.png"
    )

    file_path = os.path.join(
        generated_dir,
        filename,
    )

    with open(
        file_path,
        "wb",
    ) as image_file:
        image_file.write(image_bytes)

    # -----------------------------------------------------
    # RETURN PUBLIC CHAT URL
    # -----------------------------------------------------

    image_url = (
        f"/images/generated/{filename}"
    )

    return {
        "success": True,
        "image_url": image_url,
        "prompt": prompt,
    }


# =========================================================
# SERVE GENERATED IMAGE
# =========================================================

@router.get("/generated/{filename}")
def get_generated_image(
    filename: str,
):
    generated_dir = os.path.abspath(
        os.path.join(
            settings.UPLOAD_DIR,
            "generated",
        )
    )

    safe_filename = os.path.basename(
        filename
    )

    file_path = os.path.join(
        generated_dir,
        safe_filename,
    )

    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=404,
            detail="Generated image not found.",
        )

    return FileResponse(
        file_path,
        media_type="image/png",
    )