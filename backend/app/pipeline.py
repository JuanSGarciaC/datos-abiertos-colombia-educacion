"""Pipeline: extraer -> validar -> analizar -> resumir -> conciliar -> guardar.

Uso (desde la carpeta backend, con el entorno activo):
    python -m app.pipeline run --config ../config/dataset.yaml
    python -m app.pipeline run --sample          # datos sintéticos, solo para desarrollo
"""
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pandas as pd
import yaml

from .analyze import compute_metrics, period_settings
from .config import ColumnsCfg, load_cfg, settings
from .db import engine, init_db, put_artifact
from .extract import fetch_all, save_raw
from .reconcile import reconcile
from .sample import SampleParams, make_sample
from .summarize import build_facts, summarize
from .validate import validate

log = logging.getLogger("datos.pipeline")

# shortcut: progreso en memoria de un solo proceso; pasarlo a la base si la API corre con más de un worker
progress: dict = {"running": False, "stage": None, "rows": 0}


def run(config_path: str, use_sample: bool = False, sample_params: SampleParams | None = None) -> dict:
    progress.update(stage="extraer", rows=0)
    cfg = rows = None
    if use_sample:
        raw = make_sample(sample_params)
        cols = ColumnsCfg(date="fecha", category="departamento", value="valor")
        granularity = "daily"
        meta = {"dataset_id": "sintetico", "dataset_name": "Datos sintéticos de demostración", "source": "demo-sintetica"}
    else:
        cfg = load_cfg(config_path)
        rows = fetch_all(cfg, settings.socrata_app_token, on_page=lambda n: progress.update(rows=n))
        raw = pd.DataFrame(rows)
        cols = cfg.columns
        granularity = cfg.dataset.granularity
        meta = {
            "dataset_id": cfg.dataset.id,
            "dataset_name": cfg.dataset.name,
            "source": f"https://{cfg.dataset.domain}/resource/{cfg.dataset.id}",
        }
    log.info("Filas extraídas: %d", len(raw))

    progress.update(stage="validar", rows=len(raw))
    clean, report = validate(raw, cols)
    log.info("Filas válidas: %d de %d", report.rows_out, report.rows_in)
    if rows is not None:
        save_raw(rows)  # después de validar: una descarga inservible no desplaza a las copias crudas buenas

    progress.update(stage="analizar")
    freq, complete = period_settings(granularity)
    metrics = compute_metrics(clean, assume_complete=complete, freq=freq)
    facts = build_facts(metrics, report.to_dict())
    progress.update(stage="resumir")
    summary = summarize(facts)

    # Conciliación con la suma que calcula el servidor: si falla, el pipeline termina igual y queda dicho.
    progress.update(stage="conciliar")
    conc: dict = {"rows": [], "error": None}
    if cfg is not None:
        try:
            conc["rows"] = reconcile(clean, cfg, settings.socrata_app_token)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            conc["error"] = str(exc) or type(exc).__name__
            log.warning("Sin conciliar: %s", conc["error"])

    # Todo lo anterior solo calcula. Se guarda al final y junto: si algo falla antes, queda la ejecución anterior
    # completa, y el tablero nunca mezcla filas nuevas con métricas viejas.
    progress.update(stage="guardar")
    meta["granularity"] = granularity
    meta["run_at"] = datetime.now(timezone.utc).isoformat()
    artifacts = {"meta": meta, "metrics": metrics, "quality": report.to_dict(), "facts": {"items": facts},
                 "summary": summary, "reconcile": conc}
    init_db()
    with engine.begin() as conn:
        clean.to_sql("records", conn, if_exists="replace", index=False)
        for key, payload in artifacts.items():
            put_artifact(key, payload, conn)
    try:  # el CSV es una copia para Power BI: si está abierto allí (Windows lo bloquea), la ejecución no falla
        Path("data/processed").mkdir(parents=True, exist_ok=True)
        clean.to_csv("data/processed/records.csv", index=False)
    except OSError as exc:
        log.warning("No se pudo escribir records.csv: %s", exc)
    progress.update(stage="listo")
    return {"meta": meta, "quality": report.to_dict()}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Pipeline de datos abiertos")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_run = sub.add_parser("run", help="Ejecuta el pipeline completo")
    p_run.add_argument("--config", default="../config/dataset.yaml")
    p_run.add_argument("--sample", action="store_true", help="Usa datos sintéticos (solo desarrollo)")
    p_run.add_argument("--sample-config", default=None, help="YAML con parámetros de la muestra (ver config/sample.yaml)")
    args = parser.parse_args()
    if args.cmd == "run":
        params = None
        if args.sample_config:
            with open(args.sample_config, encoding="utf-8") as f:
                params = SampleParams.model_validate(yaml.safe_load(f))
        result = run(args.config, use_sample=args.sample, sample_params=params)
        log.info("Listo: %s", result["meta"]["dataset_name"])


if __name__ == "__main__":
    main()
