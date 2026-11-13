"""Ejecución desde la API (POST /api/run), progreso y conciliación guardada. Nada toca la red."""
from pathlib import Path

import httpx
import pandas as pd
from fastapi.testclient import TestClient

import app.api as api
import app.pipeline as pl
from app.api import app
from app.config import ColumnsCfg, DatasetCfg, PipelineCfg
from app.extract import fetch_all, save_raw
from app.reconcile import reconcile

CFG_PATH = str(Path(__file__).resolve().parents[2] / "config" / "dataset.yaml")
ROWS = [{"a_o": str(y), "nombre_del_departamento": d, "c_digo_delmunicipio": f"{d}001", "nombre_del_municipio": "m",
         "tecnica_profesional": "5", "tecnologica": "3", "universitaria": str(100 + y - 2005),
         "especializacion": "2", "maestria": "1", "doctorado": "0"}
        for y in range(2005, 2022) for d in ["5", "27"]]
CONC = [{"period": "2020", "pipeline": 10.0, "source": 20.0, "source_rows": 4, "diff": -10.0, "ratio": 2.0}]


def _fake_fetch(cfg, token="", on_page=None):
    if on_page:
        on_page(len(ROWS))
    return ROWS


def _client(tmp_path, monkeypatch, fetch=_fake_fetch, conc=lambda clean, cfg, token="": CONC):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(api.settings, "dataset_config", CFG_PATH)
    monkeypatch.setattr(pl, "fetch_all", fetch)
    monkeypatch.setattr(pl, "reconcile", conc)
    return TestClient(app)


def _boom(*a, **k):
    raise httpx.ConnectError("sin red")


def test_run_ejecuta_con_datos_reales_y_guarda_la_conciliacion(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    res = client.post("/api/run")
    assert res.status_code == 200 and res.json()["quality"]["rows_in"] == len(ROWS)
    ov = client.get("/api/overview").json()
    assert ov["meta"]["source"].startswith("https://www.datos.gov.co")
    assert ov["reconcile"] == {"rows": CONC, "error": None}
    assert client.get("/api/run").json() == {"running": False, "stage": "listo", "rows": len(ROWS)}


def test_conciliacion_caida_no_tumba_el_pipeline(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch, conc=_boom)
    assert client.post("/api/run").status_code == 200
    rec = client.get("/api/overview").json()["reconcile"]
    assert rec["rows"] == [] and "sin red" in rec["error"]


def test_fuente_caida_responde_502_y_conserva_lo_anterior(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch, fetch=_boom)
    pl.run("", use_sample=True)
    assert client.post("/api/run").status_code == 502
    ov = client.get("/api/overview").json()
    assert ov["meta"]["source"] == "demo-sintetica" and ov["reconcile"] == {"rows": [], "error": None}
    assert client.get("/api/run").json()["running"] is False


def test_una_sola_ejecucion_a_la_vez(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    assert api._run_lock.acquire(blocking=False)
    try:
        assert client.post("/api/run").status_code == 409
    finally:
        api._run_lock.release()


def test_fetch_all_avisa_cada_pagina():
    pages = [[{"a": 1}, {"a": 2}], [{"a": 3}]]
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=pages[int(r.url.params["$offset"]) // 2])))
    cfg = PipelineCfg(dataset=DatasetCfg(id="abcd-1234", name="x", page_size=2), columns=ColumnsCfg(year="a", category="a"))
    seen = []
    assert len(fetch_all(cfg, client=client, on_page=seen.append)) == 3
    assert seen == [2, 3]


def test_reconcile_compara_los_datos_limpios_con_la_fuente():
    cfg = PipelineCfg(dataset=DatasetCfg(id="abcd-1234", name="x"),
                      columns=ColumnsCfg(year="a_o", category="dep", value_columns=["tec", "uni"]))
    clean = pd.DataFrame({"date": pd.to_datetime(["2020-01-01", "2020-01-01", "2021-01-01"]), "value": [10.0, 5.0, 12.5]})
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[
        {"a_o": "2020", "total": "30", "filas": "4"}, {"a_o": "2021", "total": "12.5", "filas": "1"}])))
    rows = reconcile(clean, cfg, client=client)
    assert [(r["period"], r["ratio"]) for r in rows] == [("2020", 2.0), ("2021", 1.0)]


def test_save_raw_conserva_solo_las_tres_ultimas(tmp_path):
    for name in ("raw_20200101_000000.json", "raw_20200102_000000.json", "raw_20200103_000000.json"):
        (tmp_path / name).write_text("[]")
    new = save_raw([{"a": 1}], tmp_path)
    assert len(list(tmp_path.glob("raw_*.json"))) == 3 and new.exists()
    assert not (tmp_path / "raw_20200101_000000.json").exists()


def test_un_fallo_tardio_no_deja_la_base_a_medias(tmp_path, monkeypatch):
    """Si algo falla después de validar (aquí, el resumen), siguen intactas las filas y las métricas anteriores."""
    client = _client(tmp_path, monkeypatch)
    pl.run("", use_sample=True)
    before = client.get("/api/categories").json()
    monkeypatch.setattr(pl, "summarize", lambda facts: 1 / 0)
    res = client.post("/api/run")
    assert res.status_code == 500 and "se conserva" in res.json()["detail"]
    assert client.get("/api/categories").json() == before
    assert client.get("/api/overview").json()["meta"]["source"] == "demo-sintetica"


def test_csv_bloqueado_no_tumba_la_ejecucion(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setattr(pd.DataFrame, "to_csv", lambda *a, **k: (_ for _ in ()).throw(PermissionError("abierto en Excel")))
    assert client.post("/api/run").status_code == 200
    assert client.get("/api/overview").json()["meta"]["source"].startswith("https://www.datos.gov.co")
