import pandas as pd
import pytest

from app.config import ColumnsCfg
from app.validate import validate

COLS = ColumnsCfg(date="fecha", category="dep", value="valor")


def _raw(rows):
    return pd.DataFrame(rows, columns=["fecha", "dep", "valor"])


def test_duplicados_y_invalidos_se_cuentan():
    raw = _raw([
        ("2024-01-01", "A", 1), ("2024-01-01", "A", 1),  # duplicada
        ("mala", "A", 2), ("2024-01-02", None, 3), ("2024-01-03", "B", "x"), ("2024-01-04", "B", 5),
    ])
    clean, rep = validate(raw, COLS)
    assert (rep.rows_in, rep.rows_out) == (6, 2)
    assert (rep.duplicates_removed, rep.invalid_dates, rep.missing_category, rep.invalid_values) == (1, 1, 1, 1)


def test_columna_inexistente_da_error_claro():
    with pytest.raises(ValueError, match="Columnas no encontradas"):
        validate(_raw([("2024-01-01", "A", 1)]), ColumnsCfg(date="no_existe", category="dep", value="valor"))


def test_atipicos_se_marcan_no_se_eliminan():
    rows = [(f"2024-01-{d:02d}", "A", 10 + d % 3) for d in range(1, 21)] + [("2024-01-25", "A", 5000)]
    clean, rep = validate(_raw(rows), COLS)
    assert rep.outliers_flagged == 1 and len(clean) == 21
    assert clean.loc[clean["value"] == 5000, "is_outlier"].all()


def test_sin_columna_de_valor_cada_fila_cuenta_uno():
    raw = pd.DataFrame({"fecha": ["2024-01-01", "2024-01-02"], "dep": ["A", "B"]})
    clean, rep = validate(raw, ColumnsCfg(date="fecha", category="dep"))
    assert rep.value_is_count and clean["value"].sum() == 2


def test_anio_y_mes_en_columnas_separadas():
    raw = pd.DataFrame({"anio": ["2024", "2024", "x"], "mes": ["1", "2", "3"], "dep": ["A", "A", "A"], "valor": ["5", "7", "1"]})
    clean, rep = validate(raw, ColumnsCfg(year="anio", month="mes", category="dep", value="valor"))
    assert list(clean["date"].dt.strftime("%Y-%m-%d")) == ["2024-01-01", "2024-02-01"] and rep.invalid_dates == 1


def test_config_exige_fecha_o_anio_y_mes():
    with pytest.raises(ValueError):
        ColumnsCfg(category="dep")


def test_valor_como_suma_de_columnas_y_solo_anio():
    raw = pd.DataFrame({"a_o": ["2020", "2020", "2021"], "dep": ["A", "B", "A"],
                        "tec": ["5", "2", "x"], "uni": ["10", None, "4"], "ies": ["99", "99", "99"]})
    cols = ColumnsCfg(year="a_o", category="dep", value_columns=["tec", "uni"])
    clean, rep = validate(raw, cols)
    assert sorted(clean["value"]) == [2.0, 4.0, 15.0]  # "ies" (no aditiva) no se suma
    assert clean["date"].dt.year.tolist().count(2020) == 2 and len(rep.notes) == 1


def test_value_y_value_columns_son_excluyentes():
    with pytest.raises(ValueError):
        ColumnsCfg(year="a", category="d", value="v", value_columns=["x"])
