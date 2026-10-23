from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application runtime settings loaded from environment variables."""

    # Project metadata
    PROJECT_NAME: str = "TaskFlow Management API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Security & JWT Authentication
    SECRET_KEY: str = "development_secret_key_change_in_production_min_32_chars_long"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # MongoDB Configuration
    MONGODB_URI: str = "mongodb://127.0.0.1:27017"
    MONGODB_DB_NAME: str = "taskflow_db"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        """Validates that SECRET_KEY is cryptographically sufficient and rejects trivial secrets."""
        v_clean = v.strip()
        insecure_trivial = {
            "secret",
            "changeme",
            "change_me",
            "password",
            "12345678",
            "secret_key",
            "default",
        }
        if v_clean.lower() in insecure_trivial:
            raise ValueError(
                f"Insecure SECRET_KEY '{v}': The secret key cannot be a known trivial password."
            )
        if len(v_clean) < 32:
            raise ValueError(
                f"Insecure SECRET_KEY length ({len(v_clean)} characters): "
                "The secret key must be at least 32 characters long."
            )
        return v

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
