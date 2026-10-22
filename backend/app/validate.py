"""Validación y limpieza. Cada decisión queda contada en el reporte de calidad."""
from dataclasses import asdict, dataclass, field

import pandas as pd

from .config import ColumnsCfg


@dataclass
class QualityReport:
    rows_in: int = 0
    rows_out: int = 0
    duplicates_removed: int = 0
    invalid_dates: int = 0       # vacías o con formato no reconocido
    missing_category: int = 0
    invalid_values: int = 0      # vacíos o no numéricos
    negative_values: int = 0     # se conservan, solo se cuentan
    outliers_flagged: int = 0    # se marcan, no se eliminan (regla IQR 1,5)
    value_is_count: bool = False  # True si no había columna de valor y cada fila cuenta 1
    notes: list[str] = field(default_factory=list)

    @property
    def rows_dropped(self) -> int:
        return self.rows_in - self.rows_out

    def to_dict(self) -> dict:
        d = asdict(self)
        d["rows_dropped"] = self.rows_dropped
        return d


def validate(raw: pd.DataFrame, cols: ColumnsCfg) -> tuple[pd.DataFrame, QualityReport]:
    """Devuelve (datos limpios con columnas date, category, value, is_outlier; reporte)."""
    report = QualityReport(rows_in=len(raw))
    needed = [c for c in (cols.date, cols.year, cols.month, cols.category, cols.value, *(cols.value_columns or [])) if c]
    missing = [c for c in needed if c not in raw.columns]
    if missing:
        raise ValueError(f"Columnas no encontradas: {missing}. Disponibles: {list(raw.columns)}")

    # 1) Duplicados: filas completas idénticas
    df = raw.drop_duplicates()
    report.duplicates_removed = len(raw) - len(df)

    out = pd.DataFrame(index=df.index)
    if cols.date:
        out["date"] = pd.to_datetime(df[cols.date], errors="coerce")
    else:  # año (y mes, si existe) en columnas separadas -> día 1 del período
        y = pd.to_numeric(df[cols.year], errors="coerce")
        m = pd.to_numeric(df[cols.month], errors="coerce") if cols.month else pd.Series(1, index=df.index)
        out["date"] = pd.to_datetime({"year": y, "month": m, "day": 1}, errors="coerce")
    out["category"] = df[cols.category].astype("string").str.strip()
    if cols.value_columns:
        nums = df[cols.value_columns].apply(pd.to_numeric, errors="coerce")
        out["value"] = nums.sum(axis=1, min_count=1)  # suma de las columnas disponibles
        some_missing = int((nums.isna().any(axis=1) & nums.notna().any(axis=1)).sum())
        if some_missing:
            report.notes.append(f"{some_missing} filas tenían alguna columna de valor vacía; se sumaron solo las disponibles.")
    elif cols.value:
        out["value"] = pd.to_numeric(df[cols.value], errors="coerce")
    else:
        out["value"] = 1.0
        report.value_is_count = True

    # 2) Descartes, contados por separado y en orden
    bad_date = out["date"].isna()
    report.invalid_dates = int(bad_date.sum())
    out = out[~bad_date]

    bad_cat = out["category"].isna() | (out["category"] == "")
    report.missing_category = int(bad_cat.sum())
    out = out[~bad_cat]

    bad_val = out["value"].isna()
    report.invalid_values = int(bad_val.sum())
    out = out[~bad_val]

    report.negative_values = int((out["value"] < 0).sum())

    # 3) Atípicos: se marcan, no se eliminan
    out = out.copy()
    out["is_outlier"] = False
    if not report.value_is_count and len(out) >= 8:
        q1, q3 = out["value"].quantile([0.25, 0.75])
        iqr = q3 - q1
        if iqr > 0:
            out["is_outlier"] = (out["value"] < q1 - 1.5 * iqr) | (out["value"] > q3 + 1.5 * iqr)
    report.outliers_flagged = int(out["is_outlier"].sum())

    out["category"] = out["category"].astype(str)
    out = out.sort_values("date").reset_index(drop=True)
    report.rows_out = len(out)
    if report.rows_out == 0:
        report.notes.append("No quedaron filas válidas: revisa los nombres de columnas en dataset.yaml.")
    return out, report
