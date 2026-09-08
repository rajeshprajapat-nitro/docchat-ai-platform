from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
import json


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DocumentOut(BaseModel):
    id: str
    filename: str
    num_pages: int
    num_chunks: int
    status: str
    summary: Optional[str] = None
    key_topics: Optional[List[str]] = None
    suggested_questions: Optional[List[str]] = None
    created_at: datetime

    @field_validator("key_topics", "suggested_questions", mode="before")
    @classmethod
    def parse_key_topics(cls, v):
        if v is None or isinstance(v, list):
            return v
        try:
            return json.loads(v)
        except Exception:
            return None

    class Config:
        from_attributes = True


class ChatSessionOut(BaseModel):
    id: str
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatQueryRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    document_ids: Optional[List[str]] = None
    use_web_search: bool = False


class UserUpdate(BaseModel):
    full_name: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ChatSessionUpdate(BaseModel):
    title: str


class Citation(BaseModel):
    document_id: str
    filename: str
    chunk_index: int
    page: Optional[int] = None
    snippet: str
    score: float
