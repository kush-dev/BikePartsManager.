import hashlib
import secrets

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import AppUser, AuthSession


router = APIRouter(prefix="/api/auth", tags=["authentication"])

password_hash = PasswordHash.recommended()

COOKIE_NAME = "bpm_session"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(user: AppUser):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
    }


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> AppUser:

    token = request.cookies.get(COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    session_id = hash_session_token(token)

    auth_session = db.get(AuthSession, session_id)

    if not auth_session:
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please log in again.",
        )

    now = datetime.now(timezone.utc)

    expires_at = auth_session.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        db.delete(auth_session)
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="Session expired. Please log in again.",
        )

    user = db.get(AppUser, auth_session.user_id)

    if not user or not user.is_active:
        db.delete(auth_session)
        db.commit()

        raise HTTPException(
            status_code=401,
            detail="This account is unavailable.",
        )

    return user


@router.post("/login")
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    username = payload.username.strip()

    user = db.scalar(
        select(AppUser).where(
            AppUser.username == username
        )
    )

    if (
        not user
        or not user.is_active
        or not password_hash.verify(
            payload.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password.",
        )

    raw_token = secrets.token_urlsafe(32)
    session_id = hash_session_token(raw_token)

    now = datetime.now(timezone.utc)

    auth_session = AuthSession(
        id=session_id,
        user_id=user.id,
        expires_at=now + timedelta(
            seconds=settings.session_max_age
        ),
    )

    db.add(auth_session)
    db.commit()

    response.set_cookie(
        key="bpm_session",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.session_max_age,
        path="/",
)

    return {
        "message": "Login successful.",
        "user": public_user(user),
    }


@router.get("/me")
def get_me(
    user: AppUser = Depends(get_current_user),
):
    return {
        "authenticated": True,
        "user": public_user(user),
    }


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(COOKIE_NAME)

    if token:
        session_id = hash_session_token(token)
        auth_session = db.get(AuthSession, session_id)

        if auth_session:
            db.delete(auth_session)
            db.commit()

    response.delete_cookie(
        key="bpm_session",
        path="/",
        httponly=True,
        secure=True,
        samesite="none",
    )

    return {"message": "Logged out successfully."}