from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"
    llm_provider: str = "mock"  # "mock" | "anthropic"
    anthropic_api_key: str = ""
    llm_model: str = "claude-haiku-5-5"  # verifica el nombre vigente en la documentación del proveedor
    socrata_app_token: str = ""
    cors_origins: str = "http://localhost:5173"


settings = Settings()


class DatasetCfg(BaseModel):
    id: str
    domain: str = "www.datos.gov.co"
    name: str
    page_size: int = 5000
    max_rows: int = 50000
    granularity: Literal["daily", "monthly", "yearly"] = "daily"  # monthly/yearly: cada fila ya es un período completo


class ColumnsCfg(BaseModel):
    date: str | None = None   # columna con fecha completa; o bien year (+ month opcional)
    year: str | None = None
    month: str | None = None
    category: str
    value: str | None = None                 # una columna numérica...
    value_columns: list[str] | None = None   # ...o varias que se SUMAN (solo conteos aditivos, nunca tasas)

    @model_validator(mode="after")
    def _need_date(self) -> "ColumnsCfg":
        if not (self.date or self.year):
            raise ValueError("Define 'date', o bien 'year' (y opcionalmente 'month').")
        if self.value and self.value_columns:
            raise ValueError("Usa 'value' o 'value_columns', no ambos.")
        return self


class PipelineCfg(BaseModel):
    dataset: DatasetCfg
    columns: ColumnsCfg


def load_cfg(path: str | Path) -> PipelineCfg:
    with open(path, encoding="utf-8") as f:
        return PipelineCfg.model_validate(yaml.safe_load(f))
