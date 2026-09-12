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


def _get_openai_client():
    # IMPORTANT:
    # Render environment variable mein accidental
    # space/newline ho to strip() remove karega.
    api_key = (settings.OPENAI_API_KEY or "").strip()

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API key is not configured.",
        )

    return OpenAI(
        api_key=api_key,
        timeout=120.0,
        max_retries=2,
    )


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

    print(
        f"[Image] Generating image for user "
        f"{current_user.id}"
    )

    print(
        f"[Image] Model: "
        f"{settings.IMAGE_MODEL}"
    )

    # Never print the actual API key.
    api_key = (settings.OPENAI_API_KEY or "").strip()

    print(
        f"[Image] OpenAI API key configured: "
        f"{bool(api_key)}"
    )

    print(
        f"[Image] OpenAI API key length: "
        f"{len(api_key)}"
    )

    client = _get_openai_client()

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
                "Unable to generate the image right now. "
                "Please try again."
            ),
        )

    if not result.data:
        raise HTTPException(
            status_code=500,
            detail=(
                "Image generation returned "
                "no image."
            ),
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
                "no image data."
            ),
        )

    try:
        image_bytes = base64.b64decode(
            b64_json
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail=(
                "Invalid image data returned "
                "by image service."
            ),
        )

    # -----------------------------------------
    # Save generated image
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

    # Frontend will use this URL.
    image_url = (
        f"/images/generated/"
        f"{current_user.id}/"
        f"{filename}"
    )

    print(
        f"[Image] Image saved successfully: "
        f"{file_path}"
    )

    return {
        "success": True,
        "image_url": image_url,
        "prompt": prompt,
        "session_id": payload.session_id,
    }


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
    # User can only access their own generated images.
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

    file_path = os.path.join(
        generated_dir,
        safe_filename,
    )

    # Extra path traversal protection.
    if not os.path.abspath(
        file_path
    ).startswith(
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
            detail="Generated image not found.",
        )

    return FileResponse(
        file_path,
        media_type="image/png",
    )