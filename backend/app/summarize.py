"""Resumen en lenguaje natural con control de cifras.

El modelo SOLO redacta a partir de 'hechos' con cifras ya calculadas. Después se comprueba
que cada número de la frase aparezca en el hecho original; si no, se usa el hecho tal cual.
Límite honesto: se comparan números, no se verifica que la interpretación sea correcta.
"""
import json
import logging
import re

import httpx

from .config import settings

log = logging.getLogger("datos.summarize")
_NUM = re.compile(r"\d[\d.,]*\d|\d")


def fmt(x: float, decimals: int = 0) -> str:
    """Formato es-CO: 1.234,5"""
    s = f"{x:,.{decimals}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def numbers_in(text: str) -> set[str]:
    """Números de un texto, sin separadores (1.234,5 -> 12345)."""
    return {re.sub(r"[.,]", "", t) for t in _NUM.findall(text)}


def build_facts(metrics: dict, quality: dict) -> list[dict]:
    """Cada hecho: id, texto con cifras exactas y evidencia (etiqueta -> valor)."""
    facts: list[dict] = []
    if not metrics.get("rows"):
        return facts
    yr = metrics.get("period") == "year"
    last_lbl, prev_lbl = ("Último año", "Año anterior") if yr else ("Último mes completo", "Mes anterior")

    facts.append({
        "id": "alcance",
        "text": f"El análisis cubre {fmt(metrics['rows'])} registros válidos entre {metrics['date_min']} y {metrics['date_max']}, "
                f"en {fmt(metrics['n_categories'])} categorías.",
        "evidence": {"Registros": fmt(metrics["rows"]), "Desde": metrics["date_min"], "Hasta": metrics["date_max"],
                     "Categorías": fmt(metrics["n_categories"])},
    })
    facts.append({
        "id": "total",
        "text": f"La suma total del valor es {fmt(metrics['total_value'])}.",
        "evidence": {"Total": fmt(metrics["total_value"])},
    })
    top = metrics.get("top_categories") or []
    if top:
        facts.append({
            "id": "concentracion",
            "text": f"La categoría con mayor valor es {top[0]['category']} ({fmt(top[0]['share'], 1)} % del total); "
                    f"las tres primeras suman {fmt(metrics['top3_share'], 1)} %.",
            "evidence": {"Categoría líder": top[0]["category"], "Participación": f"{fmt(top[0]['share'], 1)} %",
                         "Top 3": f"{fmt(metrics['top3_share'], 1)} %"},
        })
    if "last_month" in metrics:
        ch = metrics.get("change_pct")
        change = "sin cambio calculable (el mes anterior fue 0)" if ch is None else \
            f"un cambio de {fmt(ch, 1)} %" + (" (aumento)" if ch > 0 else " (descenso)" if ch < 0 else "")
        facts.append({
            "id": "cambio_periodo",
            "text": f"Entre {metrics['prev_month']} ({fmt(metrics['prev_value'])}) y {metrics['last_month']} "
                    f"({fmt(metrics['last_value'])}) hubo {change}.",
            "evidence": {prev_lbl: metrics["prev_month"], "Valor anterior": fmt(metrics["prev_value"]),
                         last_lbl: metrics["last_month"], "Valor": fmt(metrics["last_value"]),
                         "Cambio": "n/d" if ch is None else f"{fmt(ch, 1)} %"},
        })
    if "trend_direction" in metrics:
        d = metrics["trend_direction"]
        word = {"sube": "ascendente", "baja": "descendente", "estable": "estable"}[d]
        facts.append({
            "id": "tendencia",
            "text": f"La pendiente lineal de la serie {'anual' if yr else 'mensual'} es {word} ({fmt(metrics['trend_slope'], 1)} por {'año' if yr else 'mes'}); "
                    f"describe la serie, no pronostica.",
            "evidence": {"Pendiente/" + ("año" if yr else "mes"): fmt(metrics["trend_slope"], 1), "Años" if yr else "Meses completos": fmt(metrics["months_complete"])},
        })
        an = metrics.get("anomaly_months") or []
        facts.append({
            "id": "atipicos",
            "text": (("Años" if yr else "Meses") + " atípicos (|z| > 2): " + ", ".join(an) + ".") if an else f"Ningún {'año' if yr else 'mes completo'} resulta atípico (|z| > 2).",
            "evidence": {("Años" if yr else "Meses") + " atípicos": ", ".join(an) if an else "ninguno"},
        })
    if metrics.get("partial_last_month"):
        facts.append({
            "id": "parcial",
            "text": f"El último mes llega hasta {metrics['date_max']} y está incompleto, por eso no entra en el cambio mensual.",
            "evidence": {"Último dato": metrics["date_max"]},
        })
    facts.append({
        "id": "calidad",
        "text": f"De {fmt(quality['rows_in'])} filas recibidas se conservaron {fmt(quality['rows_out'])}; "
                f"se quitaron {fmt(quality['duplicates_removed'])} duplicadas y {fmt(quality['rows_dropped'] - quality['duplicates_removed'])} "
                f"por fecha, categoría o valor inválidos. Se marcaron {fmt(quality['outliers_flagged'])} valores atípicos sin eliminarlos.",
        "evidence": {"Recibidas": fmt(quality["rows_in"]), "Conservadas": fmt(quality["rows_out"]),
                     "Duplicadas": fmt(quality["duplicates_removed"]), "Atípicos marcados": fmt(quality["outliers_flagged"])},
    })
    return facts


def _mock(facts: list[dict]) -> list[dict]:
    return [{"fact_id": f["id"], "text": f["text"]} for f in facts]


def _anthropic(facts: list[dict]) -> list[dict]:
    system = ("Redactas un resumen en español claro para un tablero de datos. Recibes hechos con cifras exactas. "
              "Reglas: una frase por hecho; copia las cifras TAL CUAL (mismo formato); no agregues números, causas ni predicciones. "
              'Responde SOLO un JSON: [{"fact_id": "...", "text": "..."}] sin texto adicional.')
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": settings.llm_model, "max_tokens": 1000, "system": system,
              "messages": [{"role": "user", "content": json.dumps([{"fact_id": f["id"], "text": f["text"]} for f in facts], ensure_ascii=False)}]},
        timeout=60,
    )
    resp.raise_for_status()
    text = "".join(b.get("text", "") for b in resp.json()["content"] if b.get("type") == "text")
    return json.loads(re.sub(r"```json|```", "", text).strip())


def verify(facts: list[dict], drafts: list[dict]) -> list[dict]:
    """Une cada borrador con su hecho; si sus cifras no coinciden, usa el texto original."""
    by_id = {f["id"]: f for f in facts}
    drafted = {d.get("fact_id"): str(d.get("text", "")) for d in drafts if isinstance(d, dict)}
    out = []
    for f in facts:
        allowed = numbers_in(f["text"]) | numbers_in(" ".join(f["evidence"].values()))
        draft = drafted.get(f["id"])
        ok = bool(draft) and numbers_in(draft) <= allowed
        out.append({"fact_id": f["id"], "text": draft if ok else by_id[f["id"]]["text"],
                    "evidence": f["evidence"], "fallback": not ok})
    return out


def summarize(facts: list[dict]) -> dict:
    provider = settings.llm_provider
    drafts, error = [], None
    if provider == "anthropic" and settings.anthropic_api_key:
        try:
            drafts = _anthropic(facts)
        except Exception as exc:  # red, JSON inválido, clave errónea...
            error = f"{type(exc).__name__}: {exc}"
            log.warning("Falla del modelo, se usan los hechos originales: %s", error)
            provider = "mock"
            drafts = _mock(facts)
    else:
        provider = "mock"
        drafts = _mock(facts)
    sentences = verify(facts, drafts)
    return {
        "provider": provider,
        "model": settings.llm_model if provider == "anthropic" else None,
        "fallback_count": sum(s["fallback"] for s in sentences),
        "error": error,
        "sentences": sentences,
    }
