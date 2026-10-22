import pandas as pd

from app.analyze import compute_metrics, monthly_series


def _df(dates, values, cats=None):
    return pd.DataFrame({"date": pd.to_datetime(dates), "category": cats or ["A"] * len(dates), "value": values})


def test_ultimo_mes_incompleto_se_marca_parcial():
    df = _df(["2024-01-01", "2024-01-31", "2024-02-01", "2024-02-10"], [1, 1, 1, 1])
    s = monthly_series(df)
    assert list(s["partial"]) == [False, True]


def test_mes_completo_no_es_parcial():
    s = monthly_series(_df(["2024-01-31"], [1]))
    assert not s["partial"].any()


def test_cambio_mensual_ignora_mes_parcial():
    df = _df(["2024-01-15", "2024-01-31", "2024-02-10", "2024-02-29", "2024-03-02"], [10, 10, 15, 15, 999])
    m = compute_metrics(df)
    assert m["last_month"] == "2024-02" and m["change_pct"] == 50.0 and m["partial_last_month"]


def test_tendencia_y_atipicos():
    months = pd.date_range("2023-01-31", periods=12, freq="ME")
    values = [100] * 5 + [1000] + [100] * 6
    m = compute_metrics(_df(months, values))
    assert m["anomaly_months"] == ["2023-06"]


def test_vacio():
    assert compute_metrics(pd.DataFrame(columns=["date", "category", "value"])) == {"rows": 0}


def test_datos_mensuales_no_marcan_parcial():
    df = _df(["2024-01-01", "2024-02-01", "2024-03-01"], [10, 20, 30])
    assert monthly_series(df)["partial"].iloc[-1]                      # diario: día 1 parece incompleto
    assert not monthly_series(df, assume_complete=True)["partial"].any()  # mensual: completo
    assert compute_metrics(df, assume_complete=True)["last_month"] == "2024-03"


def test_serie_anual_y_metricas():
    from app.analyze import period_settings
    assert period_settings("yearly") == ("year", True) and period_settings("daily") == ("month", False)
    df = _df([f"{y}-01-01" for y in range(2010, 2020)], [10, 12, 11, 13, 12, 14, 13, 15, 14, 16])
    s = monthly_series(df, assume_complete=True, freq="year")
    assert list(s["month"])[:2] == ["2010", "2011"] and not s["partial"].any()
    m = compute_metrics(df, assume_complete=True, freq="year")
    assert m["period"] == "year" and m["last_month"] == "2019" and m["trend_direction"] == "sube"
