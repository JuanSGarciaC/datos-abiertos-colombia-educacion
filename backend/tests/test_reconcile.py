import httpx

from app.config import ColumnsCfg, DatasetCfg, PipelineCfg
from app.reconcile import compare, source_totals

CFG = PipelineCfg(dataset=DatasetCfg(id="abcd-1234", name="x"),
                  columns=ColumnsCfg(year="a_o", category="dep", value_columns=["tec", "uni"]))


def test_source_totals_pide_la_suma_al_servidor():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        return httpx.Response(200, json=[{"a_o": "2020", "total": "30", "filas": "4"}, {"a_o": "2021", "total": "12.5", "filas": "1"}])

    out = source_totals(CFG, client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert out == {"2020": (30.0, 4), "2021": (12.5, 1)}
    assert "sum(tec::number + uni::number)" in seen["$select"] and seen["$group"] == "a_o"


def test_compare_muestra_diferencia_y_razon():
    rows = compare({"2020": 15.0, "2021": 12.5}, {"2020": (30.0, 4), "2021": (12.5, 1), "2019": (7.0, 1)})
    assert rows[0] == {"period": "2019", "pipeline": 0.0, "source": 7.0, "source_rows": 1, "diff": -7.0, "ratio": None}
    assert rows[1]["ratio"] == 2.0 and rows[2]["diff"] == 0.0
