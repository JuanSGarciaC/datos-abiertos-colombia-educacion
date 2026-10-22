from app.summarize import build_facts, fmt, numbers_in, summarize, verify

METRICS = {"rows": 1500, "total_value": 98765.4, "date_min": "2023-01-01", "date_max": "2025-10-14", "n_categories": 7,
           "top_categories": [{"category": "Antioquia", "value": 1.0, "share": 30.5}], "top3_share": 70.2,
           "partial_last_month": True, "months_complete": 33}
QUALITY = {"rows_in": 1600, "rows_out": 1500, "duplicates_removed": 80, "rows_dropped": 100, "outliers_flagged": 4}


def test_formato_es_co():
    assert fmt(1234567.8, 1) == "1.234.567,8"


def test_control_de_cifras_rechaza_numero_inventado():
    facts = build_facts(METRICS, QUALITY)
    drafts = [{"fact_id": "total", "text": "El total es 123.456."}]
    out = {s["fact_id"]: s for s in verify(facts, drafts)}
    assert out["total"]["fallback"] and "98.765" in out["total"]["text"]


def test_control_de_cifras_acepta_redaccion_fiel():
    facts = build_facts(METRICS, QUALITY)
    drafts = [{"fact_id": "total", "text": "En conjunto, el valor suma 98.765."}]
    out = {s["fact_id"]: s for s in verify(facts, drafts)}
    assert not out["total"]["fallback"]


def test_resumen_mock_no_usa_fallback():
    s = summarize(build_facts(METRICS, QUALITY))
    assert s["provider"] == "mock" and s["fallback_count"] == 0 and s["sentences"]


def test_numbers_in():
    assert numbers_in("1.234,5 y 2024-03") == {"12345", "2024", "03"}
