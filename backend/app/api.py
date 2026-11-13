import threading
from contextlib import contextmanager
from pathlib import Path

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .analyze import monthly_series, period_settings
from .config import settings
from .db import engine, get_artifact
from . import pipeline
from .sample import SampleParams

app = FastAPI(title="Datos abiertos Colombia", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


_run_lock = threading.Lock()


@contextmanager
def _running():
    """Una sola ejecución a la vez: dos a la vez se pisarían la tabla records."""
    if not _run_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una ejecución en curso.")
    pipeline.progress["running"] = True
    try:
        yield
    finally:
        pipeline.progress["running"] = False
        _run_lock.release()


def _records() -> pd.DataFrame:
    try:
        return pd.read_sql("SELECT date, category, value FROM records", engine, parse_dates=["date"])
    except Exception as exc:  # tabla inexistente antes de correr el pipeline
        raise HTTPException(status_code=503, detail="Aún no hay datos. Ejecuta el pipeline primero.") from exc


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/overview")
def overview():
    keys = ["meta", "metrics", "quality", "facts", "summary", "reconcile"]
    data = {k: get_artifact(k) for k in keys}
    if data["meta"] is None:
        raise HTTPException(status_code=503, detail="Aún no hay datos. Ejecuta el pipeline primero.")
    data["facts"] = data["facts"]["items"] if data["facts"] else []
    return data


@app.get("/api/series")
def series(category: str | None = None):
    df = _records()
    meta = get_artifact("meta") or {}
    freq, complete = period_settings(meta.get("granularity", "daily"))
    return monthly_series(df, category, assume_complete=complete, freq=freq).to_dict(orient="records")


@app.get("/api/categories")
def categories():
    df = _records()
    grouped = df.groupby("category")["value"].sum().sort_values(ascending=False)
    return [{"category": c, "value": round(float(v), 2)} for c, v in grouped.items()]


@app.get("/api/sample/params")
def sample_defaults():
    """Valores por defecto de la muestra, para rellenar el formulario del tablero."""
    return SampleParams().model_dump(mode="json")


@app.post("/api/sample")
def regenerate_sample(params: SampleParams):
    """Regenera la muestra sintética. Nunca sobrescribe datos reales."""
    with _running():  # la comprobación va dentro del candado: una ejecución real no puede colarse en medio
        meta = get_artifact("meta")
        if meta is not None and meta.get("source") != "demo-sintetica":
            raise HTTPException(status_code=409, detail="La base contiene datos reales; no se sobrescribe con una muestra.")
        return pipeline.run("", use_sample=True, sample_params=params)["meta"]


@app.get("/api/run")
def run_status():
    """Etapa en curso y filas extraídas hasta ahora; el tablero lo consulta mientras espera."""
    return pipeline.progress


@app.post("/api/run")
def run_real():
    """Ejecuta el pipeline con el dataset configurado. Si la fuente falla, lo anterior queda intacto."""
    with _running():
        try:
            return pipeline.run(settings.dataset_config)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"La fuente no respondió: {exc or type(exc).__name__}") from exc
        except Exception as exc:  # configuración, esquema cambiado, base bloqueada: el tablero debe poder decir qué pasó
            raise HTTPException(status_code=500, detail=f"El pipeline falló y se conserva la ejecución anterior: {exc or type(exc).__name__}") from exc


# El tablero compilado, si existe (imagen Docker). Va al final para no tapar /api.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="tablero")
