import os
import secrets
import requests
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth
from ..database import get_db


router = APIRouter(prefix="/auth", tags=["auth"])


# =========================================================
# Send Password Reset Email using Resend
# =========================================================

def send_reset_email(email: str, reset_link: str):
    resend_api_key = os.getenv("RESEND_API_KEY", "")
    resend_from = os.getenv("RESEND_FROM", "")

    if not resend_api_key or not resend_from:
        raise RuntimeError(
            "Resend email settings are not configured"
        )

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": resend_from,
            "to": [email],
            "subject": "Reset your DocChat password",
            "html": f"""
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
                    <h2>Reset your DocChat password</h2>

                    <p>Hi,</p>

                    <p>
                        We received a request to reset your DocChat password.
                    </p>

                    <p>
                        Click the button below to create a new password:
                    </p>

                    <p style="margin: 24px 0;">
                        <a
                            href="{reset_link}"
                            style="
                                display: inline-block;
                                padding: 12px 20px;
                                background: #4f46e5;
                                color: white;
                                text-decoration: none;
                                border-radius: 8px;
                                font-weight: 600;
                            "
                        >
                            Reset Password
                        </a>
                    </p>

                    <p>
                        Or copy and open this link:
                    </p>

                    <p>
                        <a href="{reset_link}">
                            {reset_link}
                        </a>
                    </p>

                    <p>
                        This link will expire in 30 minutes.
                    </p>

                    <p>
                        If you did not request a password reset,
                        you can safely ignore this email.
                    </p>

                    <p>
                        Regards,<br>
                        <strong>DocChat</strong>
                    </p>
                </div>
            """,
            "text": f"""Hi,

We received a request to reset your DocChat password.

Click the link below to create a new password:

{reset_link}

This link will expire in 30 minutes.

If you did not request a password reset, you can safely ignore this email.

Regards,
DocChat
""",
        },
        timeout=20,
    )

    if not response.ok:
        raise RuntimeError(
            f"Resend API error {response.status_code}: {response.text}"
        )


# =========================================================
# Signup
# =========================================================

@router.post("/signup", response_model=schemas.Token)
def signup(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower().strip()

    existing = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    user = models.User(
        email=email,
        hashed_password=auth.hash_password(payload.password),
        full_name=payload.full_name,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token({"sub": user.id})

    return {
        "access_token": token,
        "user": user,
    }


# =========================================================
# Login
# =========================================================

@router.post("/login", response_model=schemas.Token)
def login(
    payload: schemas.UserLogin,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower().strip()

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if not user or not auth.verify_password(
        payload.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = auth.create_access_token({"sub": user.id})

    return {
        "access_token": token,
        "user": user,
    }


# =========================================================
# Forgot Password
# =========================================================

@router.post("/forgot-password")
def forgot_password(
    payload: schemas.ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower().strip()

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    # Don't reveal whether an email is registered
    if not user:
        return {
            "message": (
                "If an account exists with this email, "
                "a password reset link has been sent."
            )
        }

    # Invalidate previous unused reset tokens
    old_tokens = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == 0,
        )
        .all()
    )

    for old_token in old_tokens:
        old_token.used = 1

    # Generate secure random reset token
    reset_token = secrets.token_urlsafe(48)

    reset_record = models.PasswordResetToken(
        user_id=user.id,
        token=reset_token,
        expires_at=datetime.utcnow() + timedelta(minutes=30),
        used=0,
    )

    db.add(reset_record)
    db.commit()

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5173",
    ).rstrip("/")

    reset_link = (
        f"{frontend_url}/reset-password?token={reset_token}"
    )

    try:
        send_reset_email(
            user.email,
            reset_link,
        )

    except Exception as e:
        print(f"[Password Reset Email Error] {e}")

        # Invalidate token if email could not be sent
        reset_record.used = 1
        db.commit()

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to send password reset email. "
                "Please try again later."
            ),
        )

    return {
        "message": (
            "If an account exists with this email, "
            "a password reset link has been sent."
        )
    }


# =========================================================
# Reset Password
# =========================================================

@router.post("/reset-password")
def reset_password(
    payload: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long",
        )

    reset_record = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.token == payload.token,
            models.PasswordResetToken.used == 0,
        )
        .first()
    )

    if not reset_record:
        raise HTTPException(
            status_code=400,
            detail="Invalid or already used reset link",
        )

    # Check expiration
    if reset_record.expires_at < datetime.utcnow():
        reset_record.used = 1
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Reset link has expired. Please request a new one.",
        )

    user = (
        db.query(models.User)
        .filter(models.User.id == reset_record.user_id)
        .first()
    )

    if not user:
        reset_record.used = 1
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Invalid reset request",
        )

    # Update password
    user.hashed_password = auth.hash_password(
        payload.new_password
    )

    # Token can only be used once
    reset_record.used = 1

    db.commit()

    return {
        "message": (
            "Password reset successfully. "
            "You can now log in with your new password."
        )
    }


# =========================================================
# Current User
# =========================================================

@router.get("/me", response_model=schemas.UserOut)
def me(
    current_user: models.User = Depends(auth.get_current_user),
):
    return current_user


# =========================================================
# Update Profile
# =========================================================

@router.patch("/me", response_model=schemas.UserOut)
def update_me(
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name

    db.commit()
    db.refresh(current_user)

    return current_user


# =========================================================
# Change Password
# =========================================================

@router.post("/change-password")
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not auth.verify_password(
        payload.current_password,
        current_user.hashed_password,
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long",
        )

    current_user.hashed_password = auth.hash_password(
        payload.new_password
    )

    db.commit()

    return {
        "message": "Password updated"
    }