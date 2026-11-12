import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from .config import settings

_url = make_url(settings.database_url)
if _url.drivername.startswith("sqlite") and _url.database:
    Path(_url.database).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(settings.database_url)


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE IF NOT EXISTS artifacts (key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)")
        )


def put_artifact(key: str, payload: dict, conn=None) -> None:
    """Con `conn`, escribe dentro de la transacción de quien llama (el pipeline guarda todo junto)."""
    # INSERT OR REPLACE es específico de SQLite; con PostgreSQL usa ON CONFLICT.
    stmt = text("INSERT OR REPLACE INTO artifacts (key, payload, updated_at) VALUES (:k, :p, :u)")
    params = {"k": key, "p": json.dumps(payload, ensure_ascii=False), "u": datetime.now(timezone.utc).isoformat()}
    if conn is not None:
        conn.execute(stmt, params)
        return
    init_db()
    with engine.begin() as own:
        own.execute(stmt, params)


def get_artifact(key: str) -> dict | None:
    init_db()
    with engine.connect() as conn:
        row = conn.execute(text("SELECT payload FROM artifacts WHERE key = :k"), {"k": key}).first()
    return json.loads(row[0]) if row else None
