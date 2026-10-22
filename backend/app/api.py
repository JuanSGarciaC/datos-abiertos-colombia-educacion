import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .analyze import monthly_series, period_settings
from .config import settings
from .db import engine, get_artifact
from .pipeline import run as run_pipeline
from .sample import SampleParams

app = FastAPI(title="Datos abiertos Colombia", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


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
    keys = ["meta", "metrics", "quality", "facts", "summary"]
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
    meta = get_artifact("meta")
    if meta is not None and meta.get("source") != "demo-sintetica":
        raise HTTPException(status_code=409, detail="La base contiene datos reales; no se sobrescribe con una muestra.")
    return run_pipeline("", use_sample=True, sample_params=params)["meta"]
