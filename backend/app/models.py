import uuid
from datetime import datetime, date

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text, Date
from sqlalchemy.orm import relationship

from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    documents = relationship(
        "Document",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    chats = relationship(
        "ChatSession",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    usage_logs = relationship(
        "UsageLog",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    password_reset_tokens = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=gen_uuid)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)

    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)

    num_pages = Column(Integer, default=0)
    num_chunks = Column(Integer, default=0)

    # processing | ready | failed
    status = Column(String, default="processing")

    summary = Column(Text, nullable=True)

    # JSON-encoded lists
    key_topics = Column(Text, nullable=True)
    suggested_questions = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="documents")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String, primary_key=True, default=gen_uuid)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)

    title = Column(String, default="New Chat")

    # comma-separated document IDs
    document_ids = Column(Text, default="")

    share_token = Column(
        String,
        unique=True,
        nullable=True,
        index=True,
    )

    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="chats")

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=gen_uuid)

    session_id = Column(
        String,
        ForeignKey("chat_sessions.id"),
        nullable=False,
    )

    # user | assistant
    role = Column(String, nullable=False)

    content = Column(Text, nullable=False)

    # JSON string
    citations = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship(
        "ChatSession",
        back_populates="messages",
    )


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(String, primary_key=True, default=gen_uuid)

    user_id = Column(
        String,
        ForeignKey("users.id"),
        nullable=False,
    )

    day = Column(Date, default=date.today)

    uploads = Column(Integer, default=0)
    queries = Column(Integer, default=0)

    user = relationship(
        "User",
        back_populates="usage_logs",
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String, primary_key=True, default=gen_uuid)

    user_id = Column(
        String,
        ForeignKey("users.id"),
        nullable=False,
    )

    # Random secure token
    token = Column(
        String,
        unique=True,
        index=True,
        nullable=False,
    )

    # Token expiry time
    expires_at = Column(
        DateTime,
        nullable=False,
    )

    # Prevent token reuse
    used = Column(
        Integer,
        default=0,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    user = relationship(
        "User",
        back_populates="password_reset_tokens",
    )