from fastapi.testclient import TestClient

from app.api import app
from app.pipeline import run


def test_pipeline_completo_y_api(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # data/processed se escribe en la carpeta temporal
    result = run("", use_sample=True)
    assert result["quality"]["duplicates_removed"] >= 8
    assert (tmp_path / "data/processed/records.csv").exists()

    client = TestClient(app)
    ov = client.get("/api/overview").json()
    assert ov["meta"]["source"] == "demo-sintetica"
    assert ov["metrics"]["partial_last_month"] is True
    assert ov["summary"]["fallback_count"] == 0
    assert "2024-06" in ov["metrics"]["anomaly_months"]

    series = client.get("/api/series").json()
    assert series[-1]["partial"] is True
    assert client.get("/api/series", params={"category": "Nariño"}).json()
    assert len(client.get("/api/categories").json()) == 7


def test_muestra_editable_por_api(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    client = TestClient(app)
    defaults = client.get("/api/sample/params").json()
    assert len(defaults["categories"]) == 7

    body = {**defaults, "categories": [{"name": "X", "weight": 3}, {"name": "Y", "weight": 1}],
            "anomaly_month": None, "start": "2024-01-01", "end": "2024-12-31", "seed": 3}
    assert client.post("/api/sample", json=body).status_code == 200
    cats = {c["category"] for c in client.get("/api/categories").json()}
    assert cats == {"X", "Y"}
    # Sin mes atípico inyectado, el mes de junio ya no debe destacar (el azar puede marcar otro).
    assert "2024-06" not in client.get("/api/overview").json()["metrics"]["anomaly_months"]


def test_muestra_rechaza_parametros_invalidos(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    client = TestClient(app)
    d = client.get("/api/sample/params").json()
    assert client.post("/api/sample", json={**d, "end": "2020-01-01"}).status_code == 422
    assert client.post("/api/sample", json={**d, "anomaly_month": "2024-13"}).status_code == 422


def test_no_sobrescribe_datos_reales(tmp_path, monkeypatch):
    from app.db import put_artifact
    monkeypatch.chdir(tmp_path)
    put_artifact("meta", {"source": "https://www.datos.gov.co/resource/abcd-1234"})
    client = TestClient(app)
    assert client.post("/api/sample", json=client.get("/api/sample/params").json()).status_code == 409


def test_pipeline_anual_con_dataset_yaml(tmp_path, monkeypatch):
    """Usa config/dataset.yaml real (parsea bien) con filas simuladas con la forma esperada. No toca la red."""
    from pathlib import Path
    import app.pipeline as pl
    monkeypatch.chdir(tmp_path)
    rows = [{"a_o": str(y), "nombre_del_departamento": d, "nombre_del_municipio": "m", "tecnica_profesional": str(5 + i),
             "tecnologica": "3", "universitaria": str(100 * (i + 1) + y - 2005), "especializacion": "2", "maestria": "1",
             "doctorado": "0", "ies_con_oferta": "9"}
            for y in range(2005, 2022) for i, d in enumerate(["Antioquia", "Chocó", "Meta"])]
    monkeypatch.setattr(pl, "fetch_all", lambda cfg, token="": rows)
    cfg_path = Path(__file__).resolve().parents[2] / "config" / "dataset.yaml"
    pl.run(str(cfg_path))
    client = TestClient(app)
    ov = client.get("/api/overview").json()
    assert ov["meta"]["granularity"] == "yearly" and ov["metrics"]["period"] == "year"
    assert ov["metrics"]["last_month"] == "2021" and ov["metrics"]["partial_last_month"] is False
    assert ov["quality"]["rows_out"] == 51
    assert any("año" in x["text"] for x in ov["summary"]["sentences"])
    s = client.get("/api/series").json()
    assert s[0]["month"] == "2005" and len(s) == 17
