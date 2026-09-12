import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    # -----------------------------------------
    # App
    # -----------------------------------------

    APP_NAME: str = "DocChat RAG Platform"

    ENV: str = os.getenv(
        "ENV",
        "development",
    )

    # -----------------------------------------
    # JWT
    # -----------------------------------------

    JWT_SECRET: str = os.getenv(
        "JWT_SECRET",
        "change-this-super-secret-key",
    )

    JWT_ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = (
        60 * 24
    )

    # -----------------------------------------
    # Database
    # -----------------------------------------

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./docchat.db",
    )

    # -----------------------------------------
    # Gemini
    # -----------------------------------------

    GOOGLE_API_KEY: str = os.getenv(
        "GOOGLE_API_KEY",
        "",
    )

    GOOGLE_API_KEYS: str = os.getenv(
        "GOOGLE_API_KEYS",
        "",
    )

    CHAT_MODEL: str = os.getenv(
        "CHAT_MODEL",
        "models/gemini-flash-latest",
    )

    LITE_MODEL: str = os.getenv(
        "LITE_MODEL",
        "models/gemini-flash-lite-latest",
    )

    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL",
        "models/gemini-embedding-2-preview",
    )

    EMBEDDING_DIM: int = int(
        os.getenv(
            "EMBEDDING_DIM",
            "768",
        )
    )

    # -----------------------------------------
    # Gemini Image Generation
    # -----------------------------------------

    GEMINI_IMAGE_MODEL: str = os.getenv(
        "GEMINI_IMAGE_MODEL",
        "gemini-2.5-flash-image",
    )

    # -----------------------------------------
    # Pinecone
    # -----------------------------------------

    PINECONE_API_KEY: str = os.getenv(
        "PINECONE_API_KEY",
        "",
    )

    PINECONE_INDEX: str = os.getenv(
        "PINECONE_INDEX",
        "docchat-index",
    )

    PINECONE_CLOUD: str = os.getenv(
        "PINECONE_CLOUD",
        "aws",
    )

    PINECONE_REGION: str = os.getenv(
        "PINECONE_REGION",
        "us-east-1",
    )

    # -----------------------------------------
    # RAG
    # -----------------------------------------

    CHUNK_SIZE: int = int(
        os.getenv(
            "CHUNK_SIZE",
            "1000",
        )
    )

    CHUNK_OVERLAP: int = int(
        os.getenv(
            "CHUNK_OVERLAP",
            "150",
        )
    )

    TOP_K: int = int(
        os.getenv(
            "TOP_K",
            "6",
        )
    )

    # -----------------------------------------
    # Limits
    # -----------------------------------------

    MAX_UPLOADS_PER_DAY: int = int(
        os.getenv(
            "MAX_UPLOADS_PER_DAY",
            "20",
        )
    )

    MAX_QUERIES_PER_DAY: int = int(
        os.getenv(
            "MAX_QUERIES_PER_DAY",
            "200",
        )
    )

    # -----------------------------------------
    # Uploads
    # -----------------------------------------

    UPLOAD_DIR: str = os.getenv(
        "UPLOAD_DIR",
        "./uploads",
    )

    # -----------------------------------------
    # CORS
    # -----------------------------------------

    ALLOWED_ORIGINS: list = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    ).split(",")


settings = Settings()


os.makedirs(
    settings.UPLOAD_DIR,
    exist_ok=True,
)