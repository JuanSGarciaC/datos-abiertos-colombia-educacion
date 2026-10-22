"""Datos SINTÉTICOS para desarrollar sin red. Nunca los presentes como datos reales.

Todo es editable con SampleParams: desde config/sample.yaml (--sample-config),
o desde el panel "Editar la muestra" del tablero (POST /api/sample).
"""
from datetime import date

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

_DEFAULT_CATS = [("Antioquia", 0.28), ("Bogotá D.C.", 0.30), ("Valle del Cauca", 0.16), ("Atlántico", 0.09),
                 ("Santander", 0.08), ("Nariño", 0.05), ("Boyacá", 0.04)]


class SampleCategory(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    weight: float = Field(gt=0, le=1000)  # peso relativo; se normaliza


class SampleParams(BaseModel):
    seed: int = 7
    start: date = date(2023, 1, 1)
    end: date = date(2025, 10, 14)  # un fin a mitad de mes deja un último mes incompleto
    categories: list[SampleCategory] = Field(
        default_factory=lambda: [SampleCategory(name=n, weight=w) for n, w in _DEFAULT_CATS], min_length=2, max_length=12)
    base_level: float = Field(40, gt=0, le=500)             # escala general de los valores
    growth_pct_per_month: float = Field(0.4, ge=-5, le=10)  # tendencia lineal
    anomaly_month: str | None = Field("2024-06", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    anomaly_factor: float = Field(2.6, ge=0.1, le=10)       # multiplicador del mes atípico
    add_dirty_rows: bool = True                             # filas malas y duplicadas para probar la validación

    @model_validator(mode="after")
    def _check(self) -> "SampleParams":
        if self.end <= self.start:
            raise ValueError("La fecha final debe ser posterior a la inicial.")
        if (self.end - self.start).days > 2200:
            raise ValueError("El rango máximo es de unos 6 años.")
        if len({c.name for c in self.categories}) != len(self.categories):
            raise ValueError("Los nombres de categoría no pueden repetirse.")
        return self


def make_sample(params: SampleParams | None = None) -> pd.DataFrame:
    p = params or SampleParams()
    rng = np.random.default_rng(p.seed)
    names = [c.name for c in p.categories]
    w = np.array([c.weight for c in p.categories], dtype=float)
    w = w / w.sum()
    start = pd.Timestamp(p.start)
    rows = []
    for d in pd.date_range(start, pd.Timestamp(p.end), freq="D"):
        trend = max(0.05, 1 + (p.growth_pct_per_month / 100) * (d - start).days / 30)
        mult = p.anomaly_factor if p.anomaly_month == d.strftime("%Y-%m") else 1.0
        for name, wi in zip(names, w):
            if rng.random() < 0.55:
                rows.append((d.strftime("%Y-%m-%dT00:00:00.000"), name, int(rng.poisson(p.base_level * 5 * wi * trend * mult)) + 1))
    df = pd.DataFrame(rows, columns=["fecha", "departamento", "valor"])
    if not p.add_dirty_rows:
        return df
    first = p.start.isoformat() + "T00:00:00.000"
    dirty = pd.DataFrame(
        [("fecha-mala", names[0], 5), (first, None, 4), (first, names[1], "abc")], columns=df.columns)
    dups = df.sample(min(8, len(df)), random_state=p.seed)
    return pd.concat([df, dirty, dups], ignore_index=True)
