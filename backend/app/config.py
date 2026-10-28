from functools import lru_cache
from pathlib import Path
from typing import Annotated, List

from pydantic import Field, field_validator
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / '.env'


class Settings(BaseSettings):
    app_name: str = 'RiskOps'
    app_env: str = 'development'
    debug: bool = False
    secret_key: str = Field('change-me', repr=False)
    database_url: str = 'sqlite:///./backend/riskops.db'
    cors_origins: Annotated[List[str], NoDecode] = []
    demo_api_token: str = Field('', repr=False)

    llm_provider: str = 'gemini'
    gemini_api_key: str = Field('', repr=False)
    gemini_model: str = ''
    gemini_fallback_models: Annotated[List[str], NoDecode] = []
    llm_timeout_seconds: float = Field(30.0, gt=0, le=30)

    default_budget: float = 500000.0
    simulation_iterations: int = 10000

    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra='ignore', hide_input_in_errors=True)

    @field_validator('database_url')
    @classmethod
    def sqlite_only(cls, value):
        try:
            url = make_url(value)
        except ArgumentError:
            raise ValueError('DATABASE_URL must be a SQLite URL') from None
        if url.drivername not in ('sqlite', 'sqlite+pysqlite') or url.host or url.username or url.password:
            raise ValueError('DATABASE_URL must be a local SQLite URL')
        return value

    @field_validator('llm_provider', mode='before')
    @classmethod
    def normalize_provider(cls, value):
        return str(value).strip().lower()

    @field_validator('gemini_fallback_models', mode='before')
    @classmethod
    def parse_fallback_models(cls, value):
        return [item.strip() for item in value.split(',') if item.strip()] if isinstance(value, str) else value

    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            value = [item.strip() for item in value.split(',') if item.strip()]
        if any('*' in item or item.rstrip('/') != item for item in value):
            raise ValueError('CORS_ORIGINS must contain exact origins without wildcards or trailing slashes')
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


# Shared scoring thresholds; API labels are authoritative in the frontend.
PRIORITY_P0_CRITICALITY = 0.8
PRIORITY_P1_THRESHOLD = 0.65
PRIORITY_P2_THRESHOLD = 0.40
PRIORITY_DUE_DAYS = {'P0': 0, 'P1': 2, 'P2': 7, 'P3': 30}
