from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TextCut API"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/textcut"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # S3 Storage
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = "textcut-media"
    AWS_S3_REGION: str = "ap-northeast-1"
    
    # Local Storage (开发环境使用本地存储)
    USE_LOCAL_STORAGE: bool = True
    LOCAL_STORAGE_PATH: str = "./storage"
    
    # DeepSeek LLM
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    
    # WhisperX
    WHISPERX_MODEL: str = "large-v2"
    WHISPERX_DEVICE: str = "cpu"  # cuda or cpu
    WHISPERX_COMPUTE_TYPE: str = "int8"  # float16, int8
    WHISPERX_BATCH_SIZE: int = 16
    
    # Pyannote.audio (说话人分离)
    HF_TOKEN: str = ""  # Hugging Face token for pyannote
    DIARIZATION_MIN_SPEAKERS: int = 1
    DIARIZATION_MAX_SPEAKERS: int = 10
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    
    # Upload limits
    MAX_FILE_SIZE: int = 2 * 1024 * 1024 * 1024  # 2GB
    MAX_VIDEO_DURATION: int = 4 * 60 * 60  # 4 hours
    ALLOWED_EXTENSIONS: list[str] = ["mp4", "mov", "webm", "mkv"]
    
    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
