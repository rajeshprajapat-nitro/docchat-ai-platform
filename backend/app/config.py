import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = "DocChat RAG Platform"
    ENV: str = os.getenv("ENV", "development")

    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-this-super-secret-key")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./docchat.db")

    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    # Optional: comma-separated list of additional free-tier API keys. When
    # set, the app rotates across all of them automatically whenever one
    # hits its daily quota, so total free capacity stacks instead of being
    # capped by a single key. Falls back to GOOGLE_API_KEY alone if unset.
    GOOGLE_API_KEYS: str = os.getenv("GOOGLE_API_KEYS", "")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-2-preview")
    # "flash-latest" / "flash-lite-latest" are stable alias models that tend
    # to carry more generous free-tier quotas than brand-new preview models.
    CHAT_MODEL: str = os.getenv("CHAT_MODEL", "models/gemini-flash-latest")
    LITE_MODEL: str = os.getenv("LITE_MODEL", "models/gemini-flash-lite-latest")
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "768"))

    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")
    PINECONE_INDEX: str = os.getenv("PINECONE_INDEX", "docchat-index")
    PINECONE_CLOUD: str = os.getenv("PINECONE_CLOUD", "aws")
    PINECONE_REGION: str = os.getenv("PINECONE_REGION", "us-east-1")

    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "1000"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "150"))
    TOP_K: int = int(os.getenv("TOP_K", "6"))

    MAX_UPLOADS_PER_DAY: int = int(os.getenv("MAX_UPLOADS_PER_DAY", "20"))
    MAX_QUERIES_PER_DAY: int = int(os.getenv("MAX_QUERIES_PER_DAY", "200"))

    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")

    ALLOWED_ORIGINS: list = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")


settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
