"""Pipeline: extraer -> validar -> cargar -> analizar -> resumir.

Uso (desde la carpeta backend, con el entorno activo):
    python -m app.pipeline run --config ../config/dataset.yaml
    python -m app.pipeline run --sample          # datos sintéticos, solo para desarrollo
"""
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

from .analyze import compute_metrics, period_settings
from .config import ColumnsCfg, load_cfg, settings
from .db import engine, put_artifact
from .extract import fetch_all, save_raw
from .sample import SampleParams, make_sample
from .summarize import build_facts, summarize
from .validate import validate

log = logging.getLogger("datos.pipeline")


def run(config_path: str, use_sample: bool = False, sample_params: SampleParams | None = None) -> dict:
    if use_sample:
        raw = make_sample(sample_params)
        cols = ColumnsCfg(date="fecha", category="departamento", value="valor")
        granularity = "daily"
        meta = {"dataset_id": "sintetico", "dataset_name": "Datos sintéticos de demostración", "source": "demo-sintetica"}
    else:
        cfg = load_cfg(config_path)
        rows = fetch_all(cfg, settings.socrata_app_token)
        save_raw(rows)
        raw = pd.DataFrame(rows)
        cols = cfg.columns
        granularity = cfg.dataset.granularity
        meta = {
            "dataset_id": cfg.dataset.id,
            "dataset_name": cfg.dataset.name,
            "source": f"https://{cfg.dataset.domain}/resource/{cfg.dataset.id}",
        }
    log.info("Filas extraídas: %d", len(raw))

    clean, report = validate(raw, cols)
    log.info("Filas válidas: %d de %d", report.rows_out, report.rows_in)

    clean.to_sql("records", engine, if_exists="replace", index=False)
    Path("data/processed").mkdir(parents=True, exist_ok=True)
    clean.to_csv("data/processed/records.csv", index=False)  # útil para cargarlo en Power BI

    freq, complete = period_settings(granularity)
    metrics = compute_metrics(clean, assume_complete=complete, freq=freq)
    facts = build_facts(metrics, report.to_dict())
    summary = summarize(facts)

    meta["granularity"] = granularity
    meta["run_at"] = datetime.now(timezone.utc).isoformat()
    for key, payload in {"meta": meta, "metrics": metrics, "quality": report.to_dict(), "facts": {"items": facts}, "summary": summary}.items():
        put_artifact(key, payload)
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
