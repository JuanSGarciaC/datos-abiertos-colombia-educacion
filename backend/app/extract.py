"""Extracción desde la API SODA (Socrata) de datos.gov.co, con paginación y reintentos."""
import json
import time
from datetime import datetime
from pathlib import Path

import httpx

from .config import PipelineCfg


def _get_with_retry(client: httpx.Client, url: str, params: dict, headers: dict, attempts: int = 3) -> list[dict]:
    for i in range(attempts):
        try:
            resp = client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError):
            if i == attempts - 1:
                raise
            time.sleep(2**i)
    return []


def fetch_all(cfg: PipelineCfg, token: str = "", client: httpx.Client | None = None) -> list[dict]:
    url = f"https://{cfg.dataset.domain}/resource/{cfg.dataset.id}.json"
    headers = {"X-App-Token": token} if token else {}
    own = client is None
    client = client or httpx.Client(timeout=60)
    rows: list[dict] = []
    offset = 0
    try:
        while len(rows) < cfg.dataset.max_rows:
            params = {"$limit": cfg.dataset.page_size, "$offset": offset, "$order": ":id"}
            page = _get_with_retry(client, url, params, headers)
            if not page:
                break
            rows.extend(page)
            offset += len(page)
            if len(page) < cfg.dataset.page_size:
                break
    finally:
        if own:
            client.close()
    return rows[: cfg.dataset.max_rows]


def save_raw(rows: list[dict], directory: str | Path = "data/raw") -> Path:
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    out = path / f"raw_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return out
