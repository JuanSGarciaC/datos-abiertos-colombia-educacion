"""Estadística descriptiva sobre los datos limpios. No hace predicciones."""
import calendar

import numpy as np
import pandas as pd


def period_settings(granularity: str) -> tuple[str, bool]:
    """(freq, assume_complete) a partir de la granularidad declarada del dataset."""
    return ("year" if granularity == "yearly" else "month"), granularity != "daily"


def monthly_series(df: pd.DataFrame, category: str | None = None, assume_complete: bool = False, freq: str = "month") -> pd.DataFrame:
    """Serie mensual con marca 'partial' para el último mes si los datos no lo cubren completo."""
    data = df if category is None else df[df["category"] == category]
    if data.empty:
        return pd.DataFrame(columns=["month", "value", "partial"])
    rule, label = ("YS", "%Y") if freq == "year" else ("MS", "%Y-%m")
    s = data.set_index("date")["value"].resample(rule).sum()
    last_day = data["date"].max()
    # Con datos ya mensuales (fecha = día 1) no se puede saber si el último mes está incompleto.
    partial = freq == "month" and (not assume_complete) and last_day.day < calendar.monthrange(last_day.year, last_day.month)[1]
    out = pd.DataFrame({"month": s.index.strftime(label), "value": s.values})  # "month" guarda el período (mes o año)
    out["partial"] = False
    if partial:
        out.loc[out.index[-1], "partial"] = True
    return out


def compute_metrics(df: pd.DataFrame, assume_complete: bool = False, freq: str = "month") -> dict:
    if df.empty:
        return {"rows": 0}

    total = float(df["value"].sum())
    by_cat = df.groupby("category")["value"].sum().sort_values(ascending=False)
    top = [
        {"category": c, "value": round(float(v), 2), "share": round(float(v) / total * 100, 1) if total else 0.0}
        for c, v in by_cat.head(10).items()
    ]

    series = monthly_series(df, assume_complete=assume_complete, freq=freq)
    complete = series[~series["partial"]].reset_index(drop=True)

    metrics: dict = {
        "rows": int(len(df)),
        "total_value": round(total, 2),
        "date_min": df["date"].min().date().isoformat(),
        "date_max": df["date"].max().date().isoformat(),
        "n_categories": int(by_cat.size),
        "top_categories": top,
        "top3_share": round(sum(t["share"] for t in top[:3]), 1),
        "partial_last_month": bool(series["partial"].any()),
        "months_complete": int(len(complete)),  # períodos completos (meses o años)
        "period": freq,
    }

    if len(complete) >= 2:
        last, prev = complete.iloc[-1], complete.iloc[-2]
        metrics.update(
            last_month=last["month"],
            last_value=round(float(last["value"]), 2),
            prev_month=prev["month"],
            prev_value=round(float(prev["value"]), 2),
            change_pct=round((last["value"] - prev["value"]) / prev["value"] * 100, 1) if prev["value"] else None,
        )

    if len(complete) >= 6:
        values = complete["value"].to_numpy(dtype=float)
        slope = float(np.polyfit(np.arange(len(values)), values, 1)[0])
        mean = float(values.mean())
        rel = abs(slope) / mean if mean else 0.0
        metrics["trend_slope"] = round(slope, 2)
        metrics["trend_direction"] = "estable" if rel < 0.01 else ("sube" if slope > 0 else "baja")
        std = float(values.std())
        if std > 0:
            z = (values - mean) / std
            metrics["anomaly_months"] = [complete.iloc[i]["month"] for i in np.where(np.abs(z) > 2)[0]]
        else:
            metrics["anomaly_months"] = []

    return metrics
