"""Conciliación independiente: total por año del pipeline frente a la suma que calcula el servidor SODA.

El servidor suma las filas tal como están publicadas (sin limpieza), así que la razón fuente/pipeline
muestra cuánto quitó la limpieza en cada período. Uso, después de correr el pipeline:
    python -m app.reconcile --config ../config/dataset.yaml
"""
import argparse

import httpx
import pandas as pd

from .config import PipelineCfg, load_cfg, settings
from .db import engine


def source_totals(cfg: PipelineCfg, token: str = "", client: httpx.Client | None = None) -> dict[str, tuple[float, int]]:
    """{año: (suma publicada, filas publicadas)} calculado por la API, no por este código."""
    cols = cfg.columns
    if not (cols.year and cols.value_columns):
        raise ValueError("La conciliación necesita 'year' y 'value_columns' en dataset.yaml.")
    expr = " + ".join(f"{c}::number" for c in cols.value_columns)
    params = {"$select": f"{cols.year}, sum({expr}) as total, count(*) as filas", "$group": cols.year,
              "$order": cols.year, "$limit": 50000}
    own = client is None
    client = client or httpx.Client(timeout=60)
    try:
        resp = client.get(f"https://{cfg.dataset.domain}/resource/{cfg.dataset.id}.json", params=params,
                          headers={"X-App-Token": token} if token else {})
        resp.raise_for_status()
        return {r[cols.year]: (float(r["total"]), int(r["filas"])) for r in resp.json()}
    finally:
        if own:
            client.close()


def compare(pipeline: dict[str, float], source: dict[str, tuple[float, int]]) -> list[dict]:
    rows = []
    for period in sorted(set(pipeline) | set(source)):
        p = pipeline.get(period, 0.0)
        s, n = source.get(period, (0.0, 0))
        rows.append({"period": period, "pipeline": p, "source": s, "source_rows": n,
                     "diff": round(p - s, 2), "ratio": round(s / p, 4) if p else None})
    return rows


def reconcile(clean: pd.DataFrame, cfg: PipelineCfg, token: str = "", client: httpx.Client | None = None) -> list[dict]:
    """Total por año de los datos limpios frente a la suma publicada."""
    pipeline = clean.groupby(clean["date"].dt.year.astype(str))["value"].sum().round(2).to_dict()
    return compare(pipeline, source_totals(cfg, token, client))


def main() -> None:
    parser = argparse.ArgumentParser(description="Concilia los totales del pipeline con la fuente")
    parser.add_argument("--config", default="../config/dataset.yaml")
    cfg = load_cfg(parser.parse_args().config)
    records = pd.read_sql("select date, value from records", engine, parse_dates=["date"])
    print("| Año | Pipeline | Suma publicada | Filas publicadas | Fuente / pipeline |\n|---|---|---|---|---|")
    for r in reconcile(records, cfg, settings.socrata_app_token):
        print(f"| {r['period']} | {r['pipeline']:,.1f} | {r['source']:,.1f} | {r['source_rows']} | {r['ratio']} |")


if __name__ == "__main__":
    main()
