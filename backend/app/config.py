from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'RiskOps'
    app_env: str = 'development'
    debug: bool = True
    secret_key: str = 'change-me'
    database_url: str = 'sqlite:///./riskops.db'
    cors_origins: List[str] = ['http://localhost:3000']

    epss_api_url: str = 'https://api.first.org/data/v1/epss'
    kev_api_url: str = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
    openai_api_key: str = ''
    openai_model: str = 'gpt-4o-mini'
    openai_base_url: str = ''

    default_budget: float = 500000.0
    simulation_iterations: int = 10000

    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    @field_validator('cors_origins', mode='before')
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(',') if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
